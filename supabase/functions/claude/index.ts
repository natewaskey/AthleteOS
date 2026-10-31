// Motiq: Claude proxy (Supabase Edge Function named "claude").
// The app calls this instead of Anthropic directly, so nobody pastes an API key into the app.
// It checks the caller is signed in and on the team, applies a daily per-team limit, then
// streams the request to the Anthropic Messages API with the server's key.
//
// Secrets (Edge Functions → Secrets): ANTHROPIC_API_KEY (required), AI_DAILY_LIMIT (optional, default 200).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') || 200);
const MAX_TOKENS = 32000;
const PASS_HEADERS = ['anthropic-version', 'anthropic-beta'];

function cors(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || 'authorization, content-type, apikey, x-athleteos-team',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function fail(req: Request, status: number, message: string) {
  // Same error shape as the Anthropic API, so the app's SDK shows a normal message.
  return new Response(JSON.stringify({ type: 'error', error: { type: status === 429 ? 'rate_limit_error' : status === 401 ? 'authentication_error' : status === 403 ? 'permission_error' : 'invalid_request_error', message } }), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST' || !new URL(req.url).pathname.endsWith('/v1/messages')) return fail(req, 404, 'Not found');

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return fail(req, 500, 'The team’s Claude key isn’t set up on the server yet.');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth || !auth.user) return fail(req, 401, 'Sign in to use Claude.');

  const team = req.headers.get('x-athleteos-team') || '';
  const { data: member } = await admin.from('team_members').select('team_id').eq('team_id', team).eq('user_id', auth.user.id).maybeSingle();
  if (!member) return fail(req, 403, 'You’re not on this team.');

  const day = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin.from('ai_usage').select('requests').eq('team_id', team).eq('day', day).maybeSingle();
  const used = usage ? usage.requests : 0;
  if (used >= LIMIT) return fail(req, 429, `Your team has used today’s ${LIMIT} Claude requests. It resets at midnight UTC.`);
  await admin.from('ai_usage').upsert({ team_id: team, day, requests: used + 1 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, 'Bad request body.');
  }
  body.max_tokens = Math.min(Number(body.max_tokens) || 4000, MAX_TOKENS);

  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  for (const h of PASS_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  const upstream = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  // Stream straight through (the app streams long program designs).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...cors(req), 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' },
  });
});
