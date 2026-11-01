/*
 * Cloud sync with Supabase (see supabase/schema.sql).
 *
 * The app keeps working offline from localStorage. When signed in, the state is split into
 * records (one per athlete, session, message, ...) and synced record by record:
 *   - push: records whose content changed since the last sync are upserted; removed ones are
 *     marked deleted
 *   - pull: records changed on the server since the last pull are applied, except ones with an
 *     unsynced local change (the local edit wins and is pushed)
 * Privacy:
 *   - check-in notes the athlete doesn't share, and cycle data unless shared, go in a private
 *     record only that login can read; the athlete record the coach sees has them removed
 *   - athletes only receive their own records plus team-wide ones; teammates appear as a
 *     roster card (name, sport, position)
 * Pure helpers (snapshot, applyRows, ...) work in Node for tests. The browser client is window.Cloud.
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;

  // Never synced: per-device settings and who is using this device.
  const LOCAL_ONLY = new Set(['version', 'settings', 'session', 'activeStaffId', 'ai', 'mode']);

  // FNV-1a, enough to tell whether a record changed.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + ':' + str.length;
  }

  const isCollection = (v) => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && typeof x.id === 'string');
  const keyOf = (coll, id) => `${coll}/${id}`;
  const ownerOf = (coll, id, data) => (coll === 'athletes' ? id : data && typeof data.athleteId === 'string' ? data.athleteId : null);

  // Split an athlete into what the team sees and what stays private to the athlete's login.
  function splitAthlete(a, { solo = false } = {}) {
    if (solo) return { shared: a, priv: null };
    const shareNotes = !a.privacy || a.privacy.shareNotes !== false;
    const shareCycle = !!(a.privacy && a.privacy.shareCycle);
    const byDate = {};
    const checkins = (a.checkins || []).map((c) => {
      const p = {};
      if (!shareNotes && c.note) p.note = c.note;
      if (!shareCycle && (c.period || (c.symptoms && c.symptoms.length))) Object.assign(p, { period: !!c.period, symptoms: c.symptoms || [] });
      if (!Object.keys(p).length) return c;
      byDate[c.date] = p;
      const out = { ...c };
      if ('note' in p) out.note = '';
      if ('period' in p) Object.assign(out, { period: false, symptoms: [] });
      return out;
    });
    return { shared: { ...a, checkins }, priv: Object.keys(byDate).length ? { byDate } : null };
  }

  // Put private fields back into an athlete received from the team.
  function joinAthlete(a, priv) {
    if (!priv || !priv.byDate) return a;
    return { ...a, checkins: (a.checkins || []).map((c) => (priv.byDate[c.date] ? { ...c, ...priv.byDate[c.date] } : c)) };
  }

  // Parent approvals come from the server (a parent's own login), not from the athlete's device.
  // consents: { athleteId: { at: ms|null, name } } for athletes with a parent code. Returns true if state changed.
  function applyConsents(state, consents, myAthleteId) {
    const a = myAthleteId && (state.athletes || []).find((x) => x.id === myAthleteId);
    const c = a && consents[myAthleteId];
    if (!c) return false;
    const g = a.guardian || { name: '', email: '', consentAt: null };
    const at = c.at || null;
    const name = c.name || g.name;
    if (g.consentAt === at && g.name === name) return false;
    a.guardian = { ...g, consentAt: at, name };
    return true;
  }

  /*
   * snapshot(state, { stubs, solo, myAthleteId, role }) -> Map key -> { coll, id, data, athlete_id, is_private, h }
   * stubs: athlete ids that are only roster cards on this device (never pushed as athletes).
   */
  function snapshot(state, { stubs = new Set(), solo = false, myAthleteId = null } = {}) {
    const out = new Map();
    const put = (coll, id, data, extra = {}) => {
      const json = JSON.stringify(data);
      out.set(keyOf(coll, id), { coll, id, data, athlete_id: extra.athlete_id !== undefined ? extra.athlete_id : ownerOf(coll, id, data), is_private: !!extra.is_private, h: hash(json) });
    };
    const meta = {};
    for (const [k, v] of Object.entries(state)) {
      if (LOCAL_ONLY.has(k)) continue;
      if (isCollection(v) && k !== 'athletes') {
        for (const r of v) put(k, r.id, r);
      } else if (k !== 'athletes') meta[k] = v;
    }
    put('meta', 'team', meta, { athlete_id: null });
    for (const a of state.athletes || []) {
      if (stubs.has(a.id)) continue;
      const { shared, priv } = splitAthlete(a, { solo });
      put('athletes', a.id, shared);
      put('roster', a.id, { id: a.id, name: a.name, sport: a.sport, position: a.position || '' }, { athlete_id: null });
      // Only the athlete's own login writes their private record.
      if (priv && a.id === myAthleteId) put('private', a.id, priv, { athlete_id: a.id, is_private: true });
    }
    return out;
  }

  // Whether this login may write a record (mirrors the server's policies, so pushes don't fail).
  function canWrite(rec, { role, myAthleteId }) {
    if (rec.is_private) return rec.athlete_id === myAthleteId;
    if (role === 'coach') return true;
    if (!myAthleteId) return false;
    return rec.athlete_id === myAthleteId || (rec.coll === 'roster' && rec.id === myAthleteId);
  }

  /*
   * changes(snap, base, ctx) -> { upserts: [rec], deletes: [{ coll, id, athlete_id }] }
   * base: key -> hash at the last sync.
   */
  function changes(snap, base, ctx) {
    const upserts = [];
    const deletes = [];
    for (const [k, rec] of snap) if (base[k] !== rec.h && canWrite(rec, ctx)) upserts.push(rec);
    for (const k of Object.keys(base)) {
      if (snap.has(k) || base[k] === 'deleted') continue;
      const [coll, ...rest] = k.split('/');
      const id = rest.join('/');
      if (coll === 'meta' || coll === 'private') continue;
      // A roster card disappears locally when its athlete was a stub; never delete those.
      if (coll === 'roster' && ctx.stubs && ctx.stubs.has(id)) continue;
      const rec = { coll, id, athlete_id: coll === 'athletes' ? id : ctx.ownerHint ? ctx.ownerHint[k] || null : null, is_private: false };
      if (canWrite(rec, ctx)) deletes.push(rec);
    }
    return { upserts, deletes };
  }

  /*
   * localEdits(snap, base, ctx) -> Set of keys with unpushed local edits (changes or deletes) to
   * records synced before. These win over what the server sends. Records this login can't write,
   * or never synced (a fresh device's defaults), always follow the server.
   */
  function localEdits(snap, base, ctx) {
    const { upserts, deletes } = changes(snap, base, ctx);
    return new Set([...upserts.filter((r) => keyOf(r.coll, r.id) in base), ...deletes].map((r) => keyOf(r.coll, r.id)));
  }

  /*
   * applyRows(state, rows, { stubs, privates }) -> state
   * rows: [{ coll, id, data, deleted }] from the server. Mutates stubs and privates.
   */
  function applyRows(state, rows, { stubs = new Set(), privates = {} } = {}) {
    for (const r of rows) {
      if (r.coll === 'meta') {
        if (!r.deleted && r.data) for (const [k, v] of Object.entries(r.data)) if (!LOCAL_ONLY.has(k)) state[k] = v;
        continue;
      }
      if (r.coll === 'private') {
        if (r.deleted) delete privates[r.id];
        else privates[r.id] = r.data;
        const a = (state.athletes || []).find((x) => x.id === r.id);
        if (a && r.data) Object.assign(a, joinAthlete(a, r.data));
        continue;
      }
      if (r.coll === 'roster') {
        const has = (state.athletes || []).find((x) => x.id === r.id);
        if (r.deleted) {
          if (has && stubs.has(r.id)) state.athletes = state.athletes.filter((x) => x.id !== r.id), stubs.delete(r.id);
        } else if (!has) {
          state.athletes = state.athletes || [];
          state.athletes.push(C.normalizeAthlete({ ...r.data, id: r.id }));
          stubs.add(r.id);
        } else if (stubs.has(r.id)) Object.assign(has, { name: r.data.name, sport: r.data.sport, position: r.data.position });
        continue;
      }
      if (r.coll === 'athletes') {
        state.athletes = (state.athletes || []).filter((x) => x.id !== r.id);
        if (!r.deleted && r.data) {
          state.athletes.push(joinAthlete({ ...r.data, id: r.id }, privates[r.id]));
          stubs.delete(r.id);
        }
        continue;
      }
      const list = Array.isArray(state[r.coll]) ? state[r.coll] : (state[r.coll] = []);
      const i = list.findIndex((x) => x.id === r.id);
      if (r.deleted) {
        if (i >= 0) list.splice(i, 1);
      } else if (r.data) {
        if (i >= 0) list[i] = r.data;
        else list.push(r.data);
      }
    }
    // A freshly joined device's blank placeholder athlete goes once real ones arrive.
    if (stubs.has('me') && (state.athletes || []).some((a) => a.id !== 'me')) {
      state.athletes = state.athletes.filter((a) => a.id !== 'me');
      stubs.delete('me');
    }
    return state;
  }

  const Sync = { LOCAL_ONLY, hash, snapshot, changes, localEdits, applyRows, splitAthlete, joinAthlete, canWrite, keyOf, applyConsents };

  if (node) {
    module.exports = Sync;
    return;
  }
  root.Sync = Sync;

  // ===================== browser client =====================

  const CFG = root.CLOUD_CONFIG || {};
  let arriving = null;
  let repull = false; // run one more sync straight after this one // finishing a sign-in that came back from an email link or Google
  const STORE = 'athleteos:cloud';
  const enabled = () => !!(CFG.url && CFG.key);
  let mem = loadMem();
  let hooks = { getState: () => null, setState: () => {}, onStatus: () => {} };
  let pushTimer = null;
  let busy = null;
  let lastError = '';
  let lastSync = mem.lastSync || 0;

  function loadMem() {
    try {
      return JSON.parse(localStorage.getItem(STORE)) || {};
    } catch {
      return {};
    }
  }
  function saveMem() {
    try {
      localStorage.setItem(STORE, JSON.stringify(mem));
    } catch {}
  }
  const status = () => ({
    enabled: enabled(),
    signedIn: !!(mem.auth && mem.auth.access_token),
    recovery: !!(mem.auth && mem.recovery),
    email: mem.auth ? mem.auth.email : '',
    userId: mem.auth ? mem.auth.userId || '' : '',
    name: mem.auth ? mem.auth.name || '' : '',
    team: mem.team || null,
    pending: !!pushTimer,
    syncing: !!busy,
    lastSync,
    error: lastError,
  });
  const notify = () => hooks.onStatus(status());

  // ---------- HTTP ----------

  async function http(path, { method = 'GET', body, headers = {}, auth = true, prefer } = {}) {
    if (auth) await freshToken();
    const h = { apikey: CFG.key, 'Content-Type': 'application/json', ...headers };
    if (auth && mem.auth) h.Authorization = `Bearer ${mem.auth.access_token}`;
    if (prefer) h.Prefer = prefer;
    const res = await fetch(CFG.url + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) {
      const msg = (json && (json.msg || json.message || json.error_description || json.error)) || `Server error ${res.status}`;
      const err = new Error(friendly(msg));
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function friendly(msg) {
    const m = String(msg);
    if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
    if (/already registered|already exists/i.test(m)) return 'That email already has an account. Sign in instead.';
    if (/password should be/i.test(m)) return 'Use a password of at least 6 characters.';
    if (/relation .* does not exist|could not find the function/i.test(m)) return 'The cloud database isn’t set up yet (run supabase/schema.sql).';
    return m;
  }

  // ---------- auth ----------

  function setAuth(a, email) {
    mem.auth = { access_token: a.access_token, refresh_token: a.refresh_token, expires_at: Date.now() + (a.expires_in || 3600) * 1000, email: (a.user && a.user.email) || email || (mem.auth && mem.auth.email) || '', userId: (a.user && a.user.id) || (mem.auth && mem.auth.userId) || '', name: (a.user && a.user.user_metadata && a.user.user_metadata.name) || (mem.auth && mem.auth.name) || '' };
    saveMem();
  }

  // One refresh at a time: Supabase rotates refresh tokens, so two refreshes racing with the same
  // token (e.g. sync and a sign-in check right after a page refresh) can sign the person out.
  let refreshing = null;
  function freshToken() {
    if (!mem.auth || !mem.auth.refresh_token) return Promise.resolve();
    if (mem.auth.expires_at - Date.now() > 60000) return Promise.resolve();
    if (!refreshing) refreshing = refreshToken().finally(() => (refreshing = null));
    return refreshing;
  }
  async function refreshToken() {
    try {
      const a = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: mem.auth.refresh_token }, auth: false });
      setAuth(a);
    } catch (e) {
      if (e.status === 400 || e.status === 401) {
        mem.auth = null;
        saveMem();
        notify();
      }
      throw e;
    }
  }

  // Always come back to the app's folder (not .../index.html), which is the address allowed in Supabase.
  const redirectTo = () => location.origin + location.pathname.replace(/index\.html$/, '');

  async function signUp(email, password, name = '') {
    const a = await http(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo())}`, { method: 'POST', body: { email, password, data: { name } }, auth: false });
    if (a && a.access_token) {
      setAuth(a, email);
      await afterSignIn();
      return { confirm: false };
    }
    return { confirm: true };
  }

  async function signIn(email, password) {
    const a = await http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false });
    setAuth(a, email);
    await afterSignIn();
  }

  // Which outside sign-ins (Google, ...) are switched on in the Supabase project.
  let providers = {};
  const hasProvider = (name) => !!providers[name];
  async function loadProviders() {
    try {
      const s = await http('/auth/v1/settings', { auth: false });
      providers = (s && s.external) || {};
      notify();
    } catch {}
  }

  // Google: Supabase sends the person to Google and back here with the session in the URL hash.
  function signInWithGoogle() {
    // Remember the page so the app opens there again when Google sends the person back.
    try {
      if (/^#[a-z]/.test(location.hash)) sessionStorage.setItem('athleteos:return', location.hash);
    } catch {}
    location.assign(`${CFG.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo())}`);
  }

  async function resetPassword(email) {
    await http(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo())}`, { method: 'POST', body: { email }, auth: false });
  }

  async function signOut() {
    try {
      if (mem.auth) await http('/auth/v1/logout', { method: 'POST' });
    } catch {}
    mem = {};
    saveMem();
    lastSync = 0;
    notify();
  }

  // Links in confirmation and reset emails come back with the session in the URL hash.
  function captureRedirect() {
    const h = location.hash || '';
    if (/error_description=/.test(h)) {
      // e.g. the person closed the Google window
      lastError = new URLSearchParams(h.slice(1)).get('error_description') || 'Sign in didn’t finish';
      history.replaceState(null, '', location.pathname + location.search);
      return false;
    }
    if (!/access_token=/.test(h)) return false;
    const p = new URLSearchParams(h.slice(1));
    setAuth({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600 });
    // A "forgot password" link signs the person in; they still need to pick a new password.
    if (p.get('type') === 'recovery') mem.recovery = true;
    saveMem();
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  async function updatePassword(password) {
    await http('/auth/v1/user', { method: 'PUT', body: { password } });
    delete mem.recovery;
    saveMem();
  }
  function skipRecovery() {
    delete mem.recovery;
    saveMem();
  }

  async function afterSignIn() {
    const me = await http('/auth/v1/user');
    mem.auth.userId = me.id;
    mem.auth.email = me.email;
    mem.auth.name = (me.user_metadata && (me.user_metadata.name || me.user_metadata.full_name)) || mem.auth.name || '';
    saveMem();
    notify();
  }

  // ---------- teams ----------

  async function memberships() {
    await arriving;
    const uid = mem.auth && mem.auth.userId;
    if (!uid) return [];
    return http(`/rest/v1/team_members?user_id=eq.${uid}&select=team_id,role,athlete_id,teams(name,solo,join_code,staff_code)`);
  }

  function useTeam(m, { placeholder = false } = {}) {
    mem.team = { id: m.team_id, name: (m.teams && m.teams.name) || m.team_name || '', role: m.role, athleteId: m.athlete_id || null, solo: !!(m.teams && m.teams.solo), joinCode: m.teams ? m.teams.join_code : null, staffCode: m.teams ? m.teams.staff_code : null };
    mem.base = {};
    mem.cursor = null;
    // A device that joins starts empty except the app's blank 'me' athlete, which is never uploaded.
    mem.stubs = placeholder ? ['me'] : [];
    mem.privates = {};
    mem.owners = {};
    mem.consents = {};
    saveMem();
  }

  // Upload this device's data as a new team (coach) or a personal backup (solo athlete).
  async function createTeam(name, { solo = false, athleteId = null, placeholder = false } = {}) {
    const t = await http('/rest/v1/rpc/create_team', { method: 'POST', body: { team_name: name || '', is_solo: solo, my_athlete_id: athleteId } });
    // placeholder: a new coach's roster is only the app's blank 'me' athlete, which isn't uploaded.
    useTeam({ team_id: t.id, role: solo ? 'athlete' : 'coach', athlete_id: athleteId, teams: t }, { placeholder });
    await syncNow();
    return mem.team;
  }

  // Join with a code. The device's data is replaced by the team's.
  async function joinTeam(code) {
    const rows = await http('/rest/v1/rpc/join_team', { method: 'POST', body: { code } });
    const r = Array.isArray(rows) ? rows[0] : rows;
    const list = await memberships();
    const m = list.find((x) => x.team_id === r.team_id) || { team_id: r.team_id, role: r.role, athlete_id: r.athlete_id, team_name: r.team_name };
    useTeam(m, { placeholder: true });
    hooks.setState(fresh(), { replace: true });
    await syncNow();
    return mem.team;
  }

  // A device signing in to an account that's already on a team picks it up.
  async function resume(m) {
    useTeam(m, { placeholder: true });
    hooks.setState(fresh(), { replace: true });
    await syncNow();
    return mem.team;
  }

  function fresh() {
    // migrate gives it the blank 'me' athlete the app needs to draw; it's dropped once real ones arrive.
    return C.migrate({ ...C.emptyState(), athletes: [], mode: mem.team && mem.team.solo ? 'solo' : 'team' });
  }

  // A new athlete (joined with the team code) adds themselves; the app then creates the athlete.
  async function claimNewAthlete(athleteId) {
    await http('/rest/v1/rpc/set_my_athlete', { method: 'POST', body: { t: mem.team.id, a: athleteId } });
    mem.team.athleteId = athleteId;
    mem.stubs = (mem.stubs || []).filter((x) => x !== athleteId);
    saveMem();
  }

  const inviteCode = (athleteId) => http('/rest/v1/rpc/invite_athlete', { method: 'POST', body: { t: mem.team.id, a: athleteId } });
  const logins = () => http('/rest/v1/rpc/team_logins', { method: 'POST', body: { t: mem.team.id } });
  async function newCodes() {
    const t = await http('/rest/v1/rpc/new_codes', { method: 'POST', body: { t: mem.team.id } });
    Object.assign(mem.team, { joinCode: t.join_code, staffCode: t.staff_code });
    saveMem();
    return mem.team;
  }

  async function leaveTeam() {
    if (mem.team && mem.auth) await http(`/rest/v1/team_members?team_id=eq.${mem.team.id}&user_id=eq.${mem.auth.userId}`, { method: 'DELETE' }).catch(() => {});
    const auth = mem.auth;
    mem = { auth };
    saveMem();
    notify();
  }

  // ---------- sync ----------

  const ctx = () => ({ owners: (mem.owners = mem.owners || {}), role: mem.team.role, myAthleteId: mem.team.athleteId, solo: mem.team.solo, stubs: new Set(mem.stubs || []), ownerHint: mem.owners || {} });

  async function pull() {
    const out = [];
    let cursor = mem.cursor;
    for (let page = 0; page < 50; page++) {
      const q = `/rest/v1/records?team_id=eq.${mem.team.id}&select=coll,id,data,deleted,athlete_id,updated_at&order=updated_at.asc&limit=500${cursor ? `&updated_at=gt.${encodeURIComponent(cursor)}` : ''}`;
      const rows = await http(q);
      out.push(...rows);
      if (rows.length) cursor = rows[rows.length - 1].updated_at;
      if (rows.length < 500) break;
    }
    return { rows: out, cursor };
  }

  async function push(list) {
    if (!list.length) return [];
    const rows = list.map((r) => ({ team_id: mem.team.id, coll: r.coll, id: r.id, data: r.data ?? null, athlete_id: r.athlete_id ?? null, is_private: !!r.is_private, deleted: !!r.deleted }));
    const send = (batch) => http('/rest/v1/records?on_conflict=team_id,coll,id', { method: 'POST', body: batch, prefer: 'resolution=merge-duplicates,return=minimal' });
    const done = [];
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      try {
        await send(batch);
        done.push(...batch);
      } catch (e) {
        if (e.status !== 403 && e.status !== 401 && e.status !== 409 && e.status !== 400) throw e;
        // One record the server won't take shouldn't block the rest.
        for (const r of batch) await send([r]).then(() => done.push(r), () => {});
      }
    }
    return done;
  }

  async function syncNow() {
    if (!enabled() || !mem.auth || !mem.team) return;
    if (busy) return busy;
    clearTimeout(pushTimer);
    pushTimer = null;
    busy = (async () => {
      try {
        const c = ctx();
        mem.base = mem.base || {};
        // 1. pull, keeping local edits that haven't been pushed
        const { rows, cursor } = await pull();
        let state = hooks.getState();
        const before = snapshot(state, c);
        const dirty = localEdits(before, mem.base, c);
        const take = rows.filter((r) => !dirty.has(keyOf(r.coll, r.id)) || r.coll === 'roster');
        if (take.length) {
          const privates = mem.privates || {};
          state = C.migrate(applyRows(state, take, { stubs: c.stubs, privates }));
          mem.stubs = [...c.stubs];
          mem.privates = privates;
          for (const r of take) if (r.athlete_id) mem.owners[keyOf(r.coll, r.id)] = r.athlete_id;
          const after = snapshot(state, c);
          for (const r of take) {
            const k = keyOf(r.coll, r.id);
            mem.base[k] = after.has(k) ? after.get(k).h : 'deleted';
          }
          // Echoes of this device's own pushes change nothing, so don't redraw for them.
          // Roster cards for teammates (stubs) aren't in the snapshot, so count those separately.
          const moved = after.size !== before.size || [...after].some(([k, r]) => !before.has(k) || before.get(k).h !== r.h) || take.some((r) => r.coll === 'roster' && c.stubs.has(r.id));
          if (moved) hooks.setState(state);
        }
        mem.cursor = cursor || mem.cursor;
        await refreshConsents();
        // 2. push. While the app holds (an under-18 athlete waiting on a parent), only the roster card goes,
        // so coaches see who joined but none of their data.
        state = hooks.getState();
        const hold = !!(hooks.holdPush && hooks.holdPush(state));
        const snap = snapshot(state, c);
        let { upserts, deletes } = changes(snap, mem.base, c);
        if (hold) {
          upserts = upserts.filter((r) => r.coll === 'roster');
          deletes = [];
        }
        const sent = await push([...upserts, ...deletes.map((d) => ({ ...d, deleted: true }))]);
        for (const r of sent) {
          const k = keyOf(r.coll, r.id);
          if (r.athlete_id) mem.owners[k] = r.athlete_id;
          if (r.deleted) delete mem.base[k];
          else mem.base[k] = snap.get(k).h;
        }
        lastSync = mem.lastSync = Date.now();
        lastError = '';
      } catch (e) {
        lastError = e.message || 'Sync failed';
      } finally {
        saveMem();
        busy = null;
        notify();
        if (repull) {
          repull = false;
          setTimeout(syncNow, 0);
        }
      }
    })();
    notify();
    return busy;
  }

  // ---------- parents ----------

  async function refreshConsents() {
    if (!mem.team || mem.team.solo) return;
    const rows = await http('/rest/v1/rpc/consents', { method: 'POST', body: { t: mem.team.id } }).catch(() => null);
    if (!Array.isArray(rows)) return;
    const before = mem.consents || {};
    mem.consents = Object.fromEntries(rows.map((r) => [r.athlete_id, { at: r.consent_at ? Date.parse(r.consent_at) : null, name: r.guardian_name || '' }]));
    if (mem.team.role !== 'athlete') {
      if (JSON.stringify(before) !== JSON.stringify(mem.consents)) hooks.setState(hooks.getState());
      // A parent just approved: the athlete's older records were hidden from this coach, so pull everything again.
      if (Object.entries(mem.consents).some(([id, c]) => c.at && before[id] && !before[id].at)) {
        mem.cursor = null;
        repull = true;
      }
      return;
    }
    const state = hooks.getState();
    if (applyConsents(state, mem.consents, mem.team.athleteId)) hooks.setState(state);
  }
  // An athlete's parent code (made on first ask). Coaches can't read the athlete's data until a parent approves.
  async function guardianCode() {
    const c = await http('/rest/v1/rpc/guardian_code', { method: 'POST', body: { t: mem.team.id } });
    mem.consents = { ...(mem.consents || {}), [mem.team.athleteId]: (mem.consents || {})[mem.team.athleteId] || { at: null, name: '' } };
    saveMem();
    return c;
  }
  const guardianLookup = (code) => http('/rest/v1/rpc/guardian_lookup', { method: 'POST', body: { c: code } }).then((r) => (Array.isArray(r) ? r[0] : r) || null);
  const guardianSet = (code, agree, name = '') => http('/rest/v1/rpc/guardian_set', { method: 'POST', body: { c: code, agree, gname: name } });
  const myChildren = () => (mem.auth ? http('/rest/v1/rpc/my_children', { method: 'POST', body: {} }) : Promise.resolve([]));
  // Whether an athlete has a parent code that isn't approved yet (what coaches see as "waiting on a parent").
  const awaitingParent = (athleteId) => !!(mem.consents && mem.consents[athleteId] && !mem.consents[athleteId].at);

  // Called after every local save: push a couple of seconds later.
  function changed() {
    if (!enabled() || !mem.auth || !mem.team) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, 2500);
    notify();
  }

  // Is the team's Claude server function deployed? null = not checked yet (assume yes).
  let aiReady = null;
  async function checkAI() {
    if (!enabled() || !navigator.onLine) return;
    const before = aiReady;
    try {
      const res = await fetch(CFG.url + '/functions/v1/claude/v1/messages', { method: 'OPTIONS' });
      aiReady = res.ok;
    } catch {
      // Online but the request failed outright: the function isn't there (no CORS answer).
      aiReady = navigator.onLine ? false : aiReady;
    }
    if (aiReady !== before && hooks.onAI) hooks.onAI(aiReady);
  }

  function init(h) {
    hooks = { ...hooks, ...h };
    if (!enabled()) return;
    checkAI();
    const back = captureRedirect();
    if (back) arriving = afterSignIn().catch((e) => ((lastError = e.message), notify()));
    loadProviders();
    syncNow();
    setInterval(() => document.visibilityState === 'visible' && navigator.onLine && syncNow(), 30000);
    addEventListener('online', () => syncNow());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow());
  }

  // Bearer token and team for the Claude proxy (null when not signed in to a team).
  async function aiAuth() {
    if (!enabled() || !mem.auth || !mem.team) return null;
    await freshToken();
    return { baseURL: CFG.url + '/functions/v1/claude', token: mem.auth.access_token, team: mem.team.id, key: CFG.key };
  }

  // ---------- media (videos and pose data shared with the coach) ----------
  // Private Storage bucket "media", paths team/athlete/file. Read and write rules mirror the records table.
  const mediaPath = (athleteId, name) => (mem.team && athleteId ? `${mem.team.id}/${athleteId}/${name}` : null);

  async function uploadMedia(path, body, type = 'application/octet-stream') {
    if (!enabled() || !mem.auth || !path) throw new Error('Not signed in');
    await freshToken();
    const res = await fetch(`${CFG.url}/storage/v1/object/media/${path}`, { method: 'POST', headers: { apikey: CFG.key, Authorization: `Bearer ${mem.auth.access_token}`, 'Content-Type': type, 'x-upsert': 'true' }, body });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err = new Error(/bucket not found/i.test(t) ? 'Cloud video storage isn’t set up yet (run supabase/schema.sql).' : `Upload failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return path;
  }

  async function downloadMedia(path) {
    if (!enabled() || !mem.auth || !path) return null;
    await freshToken();
    const res = await fetch(`${CFG.url}/storage/v1/object/authenticated/media/${path}`, { headers: { apikey: CFG.key, Authorization: `Bearer ${mem.auth.access_token}` } });
    return res.ok ? res.blob() : null;
  }

  // Signed-in REST call against this project (tables, RPCs, edge functions): api('/rest/v1/...', { method, body }).
  const api = (path, opts) => http(path, opts);

  root.Cloud = { init, api, mediaPath, uploadMedia, downloadMedia, status, signUp, signIn, signInWithGoogle, hasProvider, guardianCode, guardianLookup, guardianSet, myChildren, awaitingParent, signOut, resetPassword, updatePassword, skipRecovery, memberships, resume, createTeam, joinTeam, claimNewAthlete, inviteCode, logins, newCodes, leaveTeam, syncNow, changed, aiAuth, team: () => mem.team || null, enabled, aiAvailable: () => aiReady !== false, checkAI };
})(typeof window !== 'undefined' ? window : globalThis);
