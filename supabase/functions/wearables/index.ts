// Motiq: wearable sync (Supabase Edge Function named "wearables"). Turn "Verify JWT" OFF for this
// function: brand sign-in redirects and webhooks arrive without a Supabase login, so it checks the
// caller itself where one is needed.
//
// Routes (all under /functions/v1/wearables):
//   POST /connect {provider, team}      signed-in athlete -> { url } to the brand's sign-in page
//   GET  /callback/<provider>           the brand sends the athlete back here; tokens are saved, then a first sync
//   POST /sync {team}                   signed-in athlete: pull the last 14 days from each connected brand
//   POST /disconnect {provider, team}   signed-in athlete: remove the connection
//   POST /webhook/<provider>            new-data notices from the brands (GET for Oura's verification)
//
// Secrets (Edge Functions -> Secrets), only for the brands you use:
//   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET          GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET, GARMIN_WEBHOOK_KEY
//   OURA_CLIENT_ID, OURA_CLIENT_SECRET, OURA_WEBHOOK_TOKEN     POLAR_CLIENT_ID, POLAR_CLIENT_SECRET, POLAR_WEBHOOK_SECRET
//   APP_URL (optional): where to send athletes back, e.g. https://natewaskey.github.io/AthleteOS/
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { PROVIDERS, mapWhoop, mapOura, mapPolar, mapGarmin, splitGarminPush } from './map.mjs';

type Conn = {
  id: string;
  team_id: string;
  athlete_id: string;
  user_id: string;
  provider: string;
  provider_user_id: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  last_sync: string | null;
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const BASE = `${SB_URL}/functions/v1/wearables`;
const env = (k: string) => Deno.env.get(k) || '';
const creds = (p: string) => ({ id: env(`${p.toUpperCase()}_CLIENT_ID`), secret: env(`${p.toUpperCase()}_CLIENT_SECRET`) });

function cors(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || 'authorization, content-type, apikey',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(s: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// The signed-in athlete making the request, and their athlete id on the team.
async function caller(req: Request, team: string) {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth || !auth.user) return null;
  const { data: m } = await admin.from('team_members').select('role, athlete_id').eq('team_id', team).eq('user_id', auth.user.id).maybeSingle();
  if (!m || m.role !== 'athlete' || !m.athlete_id) return null;
  return { userId: auth.user.id, athleteId: m.athlete_id as string };
}

// ---------- tokens ----------

async function tokenRequest(provider: string, params: Record<string, string>) {
  const p = PROVIDERS[provider as keyof typeof PROVIDERS];
  const c = creds(provider);
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (p.tokenAuth === 'basic') headers.Authorization = `Basic ${btoa(`${c.id}:${c.secret}`)}`;
  else body.set('client_id', c.id), body.set('client_secret', c.secret);
  const res = await fetch(p.token, { method: 'POST', headers, body });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p.label} sign-in failed (${res.status}${out.error ? `: ${out.error}` : ''})`);
  return out as Record<string, any>;
}

const expiry = (secs: unknown) => (Number(secs) > 0 ? new Date(Date.now() + (Number(secs) - 600) * 1000).toISOString() : null);

async function freshToken(conn: Conn) {
  if (!conn.refresh_token || !conn.expires_at || Date.parse(conn.expires_at) > Date.now() + 60000) return conn.access_token;
  const t = await tokenRequest(conn.provider, { grant_type: 'refresh_token', refresh_token: conn.refresh_token, ...(conn.provider === 'whoop' ? { scope: 'offline' } : {}) });
  conn.access_token = t.access_token;
  conn.refresh_token = t.refresh_token || conn.refresh_token;
  conn.expires_at = expiry(t.expires_in);
  await admin.from('wearable_connections').update({ access_token: conn.access_token, refresh_token: conn.refresh_token, expires_at: conn.expires_at }).eq('id', conn.id);
  return conn.access_token;
}

class AuthLost extends Error {}

async function getJSON(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new AuthLost(`Access was revoked (${res.status})`);
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

// ---------- pulling data ----------

async function pullWhoop(token: string, days: number) {
  const start = new Date(Date.now() - days * 864e5).toISOString();
  const all = async (path: string) => {
    const out: any[] = [];
    let next = '';
    for (let page = 0; page < 12; page++) {
      const r = await getJSON(`${PROVIDERS.whoop.api}${path}?limit=25&start=${encodeURIComponent(start)}${next ? `&nextToken=${encodeURIComponent(next)}` : ''}`, token);
      out.push(...((r && r.records) || []));
      next = r && r.next_token;
      if (!next) break;
    }
    return out;
  };
  return mapWhoop({ recoveries: await all('/v2/recovery'), sleeps: await all('/v2/activity/sleep'), workouts: await all('/v2/activity/workout') });
}

async function pullOura(token: string, days: number) {
  const d = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const all = async (path: string) => {
    const out: any[] = [];
    let next = '';
    for (let page = 0; page < 12; page++) {
      const r = await getJSON(`${PROVIDERS.oura.api}${path}?start_date=${d(-days)}&end_date=${d(1)}${next ? `&next_token=${encodeURIComponent(next)}` : ''}`, token);
      out.push(...((r && r.data) || []));
      next = r && r.next_token;
      if (!next) break;
    }
    return out;
  };
  return mapOura({ readiness: await all('/daily_readiness'), sleeps: await all('/sleep'), workouts: await all('/workout') });
}

async function pullPolar(token: string) {
  const api = PROVIDERS.polar.api;
  const recharge = await getJSON(`${api}/users/nightly-recharge`, token);
  const sleep = await getJSON(`${api}/users/sleep`, token);
  const ex = await getJSON(`${api}/exercises`, token);
  return mapPolar({ recharges: (recharge && recharge.recharges) || [], nights: (sleep && sleep.nights) || [], exercises: Array.isArray(ex) ? ex : [] });
}

async function pullGarmin(token: string, days: number) {
  // Garmin's pull endpoints take upload-time windows of at most 24 hours. Most data arrives by push.
  const end = Math.floor(Date.now() / 1000);
  const out: Record<string, any[]> = { dailies: [], sleeps: [], hrv: [], activities: [] };
  for (let i = 0; i < Math.min(days, 3); i++) {
    const to = end - i * 86400;
    const from = to - 86400;
    for (const kind of Object.keys(out)) {
      const r = await getJSON(`${PROVIDERS.garmin.api}/${kind}?uploadStartTimeInSeconds=${from}&uploadEndTimeInSeconds=${to}`, token).catch((e) => {
        if (e instanceof AuthLost) throw e;
        return null;
      });
      if (Array.isArray(r)) out[kind].push(...r);
    }
  }
  return mapGarmin(out as any);
}

async function store(conn: Conn, data: { days: any[]; workouts: any[] }) {
  const now = new Date().toISOString();
  const rows = [
    ...data.days.map((d) => ({ team_id: conn.team_id, athlete_id: conn.athlete_id, provider: conn.provider, kind: 'day', key: d.date, data: d, updated_at: now })),
    ...data.workouts.map((w) => ({ team_id: conn.team_id, athlete_id: conn.athlete_id, provider: conn.provider, kind: 'workout', key: w.extId, data: w, updated_at: now })),
  ];
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from('wearable_data').upsert(rows.slice(i, i + 200), { onConflict: 'team_id,athlete_id,provider,kind,key' });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

async function syncConn(conn: Conn, days = 14) {
  try {
    const token = await freshToken(conn);
    const data = conn.provider === 'whoop' ? await pullWhoop(token, days) : conn.provider === 'oura' ? await pullOura(token, days) : conn.provider === 'polar' ? await pullPolar(token) : await pullGarmin(token, days);
    const n = await store(conn, data);
    await admin.from('wearable_connections').update({ last_sync: new Date().toISOString(), status: 'ok', error: null }).eq('id', conn.id);
    return n;
  } catch (e) {
    const lost = e instanceof AuthLost;
    await admin.from('wearable_connections').update({ status: lost ? 'reauth' : 'error', error: String((e as Error).message || e).slice(0, 300) }).eq('id', conn.id);
    if (!lost) console.error(conn.provider, e);
    return 0;
  }
}

// ---------- routes ----------

async function connect(req: Request) {
  const { provider, team } = await req.json().catch(() => ({}));
  const p = PROVIDERS[provider as keyof typeof PROVIDERS];
  if (!p) return json(req, 400, { error: 'Unknown device brand.' });
  if (!creds(provider).id) return json(req, 501, { error: `${p.label} isn’t set up on the server yet.` });
  const who = await caller(req, String(team || ''));
  if (!who) return json(req, 403, { error: 'Sign in as an athlete on this team to connect a device.' });
  const state = randomString(24);
  const verifier = p.pkce ? randomString(48) : null;
  const origin = req.headers.get('Origin') || '';
  const back = env('APP_URL') || (origin ? `${origin}${new URL(req.headers.get('Referer') || origin).pathname}` : '');
  await admin.from('wearable_states').insert({ state, user_id: who.userId, team_id: team, athlete_id: who.athleteId, provider, verifier, return_to: back });
  const q = new URLSearchParams({ response_type: 'code', client_id: creds(provider).id, redirect_uri: `${BASE}/callback/${provider}`, state });
  if (p.scope) q.set('scope', p.scope);
  if (verifier) q.set('code_challenge', b64url(await sha256(verifier))), q.set('code_challenge_method', 'S256');
  return json(req, 200, { url: `${p.authorize}?${q}` });
}

async function callback(req: Request, provider: string) {
  const u = new URL(req.url);
  const state = u.searchParams.get('state') || '';
  const { data: st } = await admin.from('wearable_states').select('*').eq('state', state).maybeSingle();
  const home = (st && st.return_to) || env('APP_URL') || '/';
  const back = (result: string) => Response.redirect(`${home.split('#')[0].split('?')[0]}?wearable=${provider}&result=${encodeURIComponent(result)}#profile`, 302);
  if (!st || st.provider !== provider || Date.now() - Date.parse(st.created_at) > 15 * 60000) return back('expired');
  await admin.from('wearable_states').delete().eq('state', state);
  const code = u.searchParams.get('code');
  if (!code) return back(u.searchParams.get('error') === 'access_denied' ? 'denied' : 'failed');
  try {
    const t = await tokenRequest(provider, { grant_type: 'authorization_code', code, redirect_uri: `${BASE}/callback/${provider}`, ...(st.verifier ? { code_verifier: st.verifier } : {}) });
    let providerUser: string | null = null;
    if (provider === 'whoop') providerUser = String(((await getJSON(`${PROVIDERS.whoop.api}/v2/user/profile/basic`, t.access_token)) || {}).user_id || '') || null;
    if (provider === 'oura') providerUser = ((await getJSON(`${PROVIDERS.oura.api}/personal_info`, t.access_token)) || {}).id || null;
    if (provider === 'garmin') providerUser = ((await getJSON(`${PROVIDERS.garmin.api}/user/id`, t.access_token)) || {}).userId || null;
    if (provider === 'polar') {
      providerUser = t.x_user_id != null ? String(t.x_user_id) : null;
      // Polar needs the user registered with this app once; 409 means already registered.
      const r = await fetch(`${PROVIDERS.polar.api}/users`, { method: 'POST', headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ 'member-id': st.athlete_id }) });
      if (!r.ok && r.status !== 409) throw new Error(`Polar registration failed (${r.status})`);
    }
    const { data: conn, error } = await admin
      .from('wearable_connections')
      .upsert({ team_id: st.team_id, athlete_id: st.athlete_id, user_id: st.user_id, provider, provider_user_id: providerUser, access_token: t.access_token, refresh_token: t.refresh_token || null, expires_at: expiry(t.expires_in), status: 'ok', error: null }, { onConflict: 'team_id,athlete_id,provider' })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    await syncConn(conn as Conn, 30);
    return back('ok');
  } catch (e) {
    console.error('callback', provider, e);
    return back('failed');
  }
}

async function syncMine(req: Request) {
  const { team } = await req.json().catch(() => ({}));
  const who = await caller(req, String(team || ''));
  if (!who) return json(req, 403, { error: 'Sign in as an athlete on this team.' });
  const { data: conns } = await admin.from('wearable_connections').select('*').eq('team_id', team).eq('athlete_id', who.athleteId);
  let rows = 0;
  for (const c of (conns || []) as Conn[]) {
    if (c.last_sync && Date.now() - Date.parse(c.last_sync) < 120000) continue; // at most every 2 minutes
    rows += await syncConn(c, 14);
  }
  return json(req, 200, { ok: true, rows });
}

async function disconnect(req: Request) {
  const { provider, team } = await req.json().catch(() => ({}));
  const who = await caller(req, String(team || ''));
  if (!who) return json(req, 403, { error: 'Sign in as an athlete on this team.' });
  const { data: conn } = await admin.from('wearable_connections').select('*').eq('team_id', team).eq('athlete_id', who.athleteId).eq('provider', provider).maybeSingle();
  if (conn) {
    const c = conn as Conn;
    // Tell the brand too, best effort: the connection is removed here either way.
    try {
      const token = await freshToken(c);
      const h = { Authorization: `Bearer ${token}` };
      if (provider === 'garmin') await fetch(`${PROVIDERS.garmin.api}/user/registration`, { method: 'DELETE', headers: h });
      if (provider === 'polar' && c.provider_user_id) await fetch(`${PROVIDERS.polar.api}/users/${c.provider_user_id}`, { method: 'DELETE', headers: h });
      if (provider === 'whoop') await fetch(`${PROVIDERS.whoop.api}/v2/user/access`, { method: 'DELETE', headers: h });
      if (provider === 'oura') await fetch(`https://api.ouraring.com/oauth/revoke?access_token=${encodeURIComponent(token)}`);
    } catch {}
    await admin.from('wearable_connections').delete().eq('id', c.id);
  }
  return json(req, 200, { ok: true });
}

async function connsFor(provider: string, providerUser: string) {
  const { data } = await admin.from('wearable_connections').select('*').eq('provider', provider).eq('provider_user_id', providerUser);
  return (data || []) as Conn[];
}

async function webhook(req: Request, provider: string) {
  const u = new URL(req.url);
  if (provider === 'oura' && req.method === 'GET') {
    // Oura checks the callback URL when a subscription is created.
    if (env('OURA_WEBHOOK_TOKEN') && u.searchParams.get('verification_token') === env('OURA_WEBHOOK_TOKEN')) return json(req, 200, { challenge: u.searchParams.get('challenge') });
    return json(req, 401, { error: 'bad token' });
  }
  const raw = await req.text();
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {}
  if (provider === 'whoop') {
    const ts = req.headers.get('X-WHOOP-Signature-Timestamp') || '';
    const sig = req.headers.get('X-WHOOP-Signature') || '';
    const want = btoa(String.fromCharCode(...(await hmac(creds('whoop').secret, ts + raw))));
    if (!sig || !safeEqual(sig, want)) return json(req, 401, { error: 'bad signature' });
    for (const c of await connsFor('whoop', String(body.user_id))) await syncConn(c, 3);
  } else if (provider === 'oura') {
    for (const c of await connsFor('oura', String(body.user_id || ''))) await syncConn(c, 3);
  } else if (provider === 'polar') {
    if (body.event === 'PING') return json(req, 200, { ok: true });
    const sig = req.headers.get('Polar-Webhook-Signature') || '';
    if (!env('POLAR_WEBHOOK_SECRET') || !safeEqual(sig, hex(await hmac(env('POLAR_WEBHOOK_SECRET'), raw)))) return json(req, 401, { error: 'bad signature' });
    for (const c of await connsFor('polar', String(body.user_id))) await syncConn(c, 3);
  } else if (provider === 'garmin') {
    if (!env('GARMIN_WEBHOOK_KEY') || u.searchParams.get('key') !== env('GARMIN_WEBHOOK_KEY')) return json(req, 401, { error: 'bad key' });
    for (const [garminUser, part] of splitGarminPush(body)) {
      for (const c of await connsFor('garmin', String(garminUser))) {
        await store(c, mapGarmin(part as any));
        await admin.from('wearable_connections').update({ last_sync: new Date().toISOString(), status: 'ok', error: null }).eq('id', c.id);
      }
    }
    for (const d of body.deregistrations || []) if (d.userId) await admin.from('wearable_connections').delete().eq('provider', 'garmin').eq('provider_user_id', String(d.userId));
  } else return json(req, 404, { error: 'Not found' });
  return json(req, 200, { ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  const path = new URL(req.url).pathname.replace(/^.*\/wearables/, '');
  try {
    if (path === '/connect' && req.method === 'POST') return await connect(req);
    if (path === '/sync' && req.method === 'POST') return await syncMine(req);
    if (path === '/disconnect' && req.method === 'POST') return await disconnect(req);
    let m = path.match(/^\/callback\/(\w+)$/);
    if (m && PROVIDERS[m[1] as keyof typeof PROVIDERS]) return await callback(req, m[1]);
    m = path.match(/^\/webhook\/(\w+)$/);
    if (m) return await webhook(req, m[1]);
    return json(req, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return json(req, 500, { error: 'Something went wrong on the server.' });
  }
});
