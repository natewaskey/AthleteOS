/*
 * Edit a program by describing the change ("swap bench for dumbbell bench, add a 4th set of
 * squats, no jumping"). The built-in parser handles common edits offline; anything it can't
 * read goes to Claude when a key is set. Pure, no DOM.
 *   apply(program, text, { equipment }) -> { program, changes: [string], unknown: [string] }
 * Browser: window.ProgramEdit. Node: require('./program-edit.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const P = node ? require('./program.js') : root.Program;

  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayOf = (word) => {
    const w = String(word || '').toLowerCase().slice(0, 3);
    const i = DAYS.findIndex((d) => d.startsWith(w));
    return w.length === 3 && i >= 0 ? i : null;
  };
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
  const num = (s) => (s == null ? null : /^\d+$/.test(s) ? +s : NUM[String(s).toLowerCase()] ?? null);
  const clean = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9/ -]/g, ' ').replace(/\s+/g, ' ').trim();
  const RESTRICT_WORDS = { jump: 'no-jumping', jumping: 'no-jumping', jumps: 'no-jumping', plyos: 'no-jumping', plyometrics: 'no-jumping', landing: 'no-jumping', running: 'no-running', sprinting: 'no-running', sprints: 'no-running', overhead: 'no-overhead' };
  // Common shorthand -> library name.
  const ALIAS = { bench: 'Bench press', squat: 'Back squat', squats: 'Back squat', deadlift: 'Deadlift', deadlifts: 'Deadlift', rdl: 'Romanian deadlift', rdls: 'Romanian deadlift', ohp: 'Overhead press', cleans: 'Power clean', clean: 'Power clean', pullups: 'Pull-up', 'pull ups': 'Pull-up', pushups: 'Push-up', 'push ups': 'Push-up', bss: 'Bulgarian split squat', 'split squats': 'Bulgarian split squat', 'hip thrusts': 'Barbell hip thrust' };

  // Lifts that are never the "easier" option.
  const ADVANCED = /depth|snatch|clean|tuck|hurdle|jerk|deficit|weighted|single-leg|pistol|nordic/i;

  const allItems = (p) => p.sessions.flatMap((s) => s.plan.blocks.flatMap((b) => b.items.map((i) => ({ s, b, i }))));

  // Best match for a phrase: among the program's exercises first, then the whole library.
  function findName(phrase, pool, { strict = false } = {}) {
    const q = clean(phrase).replace(/^(the|my|a|an|some|more|extra)\s+/, '');
    if (!q) return null;
    if (ALIAS[q] && (!pool || pool.some((n) => n === ALIAS[q]))) return ALIAS[q];
    const names = pool || C.EXERCISE_LIBRARY.map((x) => x.name);
    const norm = names.map((n) => [n, clean(n)]);
    const exact = norm.find(([, c]) => c === q || c === q.replace(/s$/, ''));
    if (exact) return exact[0];
    const contains = norm.filter(([, c]) => c.includes(q) || c.includes(q.replace(/s$/, '')));
    if (contains.length) return contains.sort((a, b) => a[1].length - b[1].length)[0][0];
    const words = q.split(' ').filter((w) => w.length > 2).map((w) => w.replace(/s$/, ''));
    let best = null, score = 0;
    for (const [n, c] of norm) {
      const hit = words.filter((w) => c.includes(w)).length;
      if (hit > score || (hit === score && best && c.length < clean(best).length)) (best = n), (score = hit);
    }
    if (!pool && ALIAS[q]) return ALIAS[q];
    return score && score >= (strict ? words.length : Math.ceil(words.length / 2)) ? best : null;
  }

  // Split a request into clauses: "a, b and c" / "a; b" / "a. b" / "a then b".
  const clauses = (text) => String(text || '').split(/\s*(?:[;.\n]|,\s*(?:and\s+)?|\band then\b|\bthen\b|\balso\b|\band\s+(?=(?:swap|replace|change|remove|drop|cut|add|make|move|more|fewer|less|heavier|lighter|no|rename|put|use|do)\b))\s*/i).map((c) => c.trim()).filter(Boolean);

  function apply(program, text, { equipment = null } = {}) {
    const p = P.normalizeProgram(JSON.parse(JSON.stringify(program)));
    p.id = program.id;
    p.createdAt = program.createdAt;
    const changes = [];
    const unknown = [];
    const inProgram = () => [...new Set(allItems(p).map((x) => x.i.name))];
    const sessionsFor = (dayWord) => {
      const d = dayOf(dayWord);
      return d == null ? p.sessions : p.sessions.filter((s) => s.day === d);
    };

    for (const raw of clauses(text)) {
      const c = clean(raw);
      let m;
      // swap X for Y / replace X with Y / change X to Y / use Y instead of X
      if ((m = c.match(/^(?:swap|replace|change|switch|sub|substitute)\s+(?:out\s+)?(.+?)\s+(?:for|with|to|into)\s+(.+)$/)) || (m = c.match(/^(?:use|do)\s+(.+?)\s+instead of\s+(.+)$/))) {
        const [from, to] = c.startsWith('use') || c.startsWith('do') ? [m[2], m[1]] : [m[1], m[2]];
        const fromName = findName(from, inProgram());
        if (!fromName) { unknown.push(raw); continue; }
        const vague = /^(something|anything)\b|^an? (alternative|easier)|^easier/.test(to);
        // A lift the library doesn't have is kept by name ("dumbbell bench" -> "Dumbbell bench").
        const alts = vague ? [...P.alternatives(fromName, { equipment }), ...P.alternatives(fromName)] : [];
        const easier = /easier|simpler|less/.test(to) ? alts.filter((n) => !ADVANCED.test(n)) : [];
        const toName = vague ? easier[0] || alts[0] : findName(to, null, { strict: true }) || titleCase(to);
        if (!toName || toName === fromName) { unknown.push(raw); continue; }
        let n = 0;
        for (const { i } of allItems(p)) if (i.name === fromName) Object.assign(i, swapItem(i, toName)), n++;
        changes.push(`Swapped ${fromName} for ${toName} (${n} time${n === 1 ? '' : 's'})`);
        continue;
      }
      // no jumping / no running / no overhead
      if ((m = c.match(/^(?:no|without|avoid|remove all|drop all|cut all|cut out|take out)\s+(?:the\s+)?(jump|jumping|jumps|plyos|plyometrics|landing|running|sprinting|sprints|overhead)(?:\s+(?:work|stuff|exercises|movements))?$/))) {
        const r = RESTRICT_WORDS[m[1]];
        const inj = [{ label: P.RESTRICTIONS[r].label, restrictions: [r] }];
        let swapped = 0, dropped = 0;
        for (const s of p.sessions) for (const b of s.plan.blocks) {
          b.items = b.items.flatMap((i) => {
            if (!P.conflict(i.name, { injuries: inj })) return [i];
            const alt = P.alternatives(i.name, { equipment, injuries: inj })[0];
            if (alt) return swapped++, [Object.assign(i, swapItem(i, alt))];
            return dropped++, [];
          });
        }
        p.sessions.forEach((s) => (s.plan.blocks = s.plan.blocks.filter((b) => b.items.length)));
        changes.push(`${P.RESTRICTIONS[r].label}: ${swapped} swapped, ${dropped} removed`);
        continue;
      }
      // remove X [on day]
      if ((m = c.match(/^(?:remove|drop|cut|delete|take out|get rid of|no)\s+(?:the\s+)?(.+?)(?:\s+(?:on|from)\s+(\w+))?$/))) {
        const name = findName(m[1], inProgram());
        if (!name) { unknown.push(raw); continue; }
        let n = 0;
        for (const s of sessionsFor(m[2])) {
          for (const b of s.plan.blocks) b.items = b.items.filter((i) => (i.name === name ? (n++, false) : true));
          s.plan.blocks = s.plan.blocks.filter((b) => b.items.length);
        }
        const on = m[2] && dayOf(m[2]) != null ? ` on ${DAY_LABEL[dayOf(m[2])]}` : '';
        changes.push(n ? `Removed ${name}${on}${n > 1 ? ` (${n} times)` : ''}` : `${name} isn’t in the program${on}, nothing removed`);
        continue;
      }
      // add N sets to X
      if ((m = c.match(/^(?:add|do)\s+(?:(an?|one|\w+)\s+)?(?:extra\s+|more\s+)?sets?\s+(?:of|to|on|for)\s+(.+)$/))) {
        const name = findName(m[2], inProgram());
        if (!name) { unknown.push(raw); continue; }
        const k = /^an?$/.test(m[1] || '') ? 1 : num(m[1]) || 1;
        for (const { i } of allItems(p)) if (i.name === name) i.sets = Math.min(10, i.sets + k);
        changes.push(`${name}: +${k} set${k === 1 ? '' : 's'}`);
        continue;
      }
      // add X [to day]
      if ((m = c.match(/^(?:add|include|put in|throw in)\s+(?:some\s+|more\s+|a\s+|an\s+)?(.+?)(?:\s+(?:to|on)\s+(\w+)(?:\s+session)?)?$/))) {
        const name = findName(m[1]);
        const lib = name && C.libraryEntry(name);
        if (!lib) { unknown.push(raw); continue; }
        const targets = sessionsFor(m[2]);
        for (const s of targets) {
          let b = s.plan.blocks.find((x) => x.type === lib.block);
          if (!b) {
            b = C.normalizePlanBlock({ type: lib.block, items: [] });
            const order = Object.keys(C.BLOCK_TYPES);
            const at = s.plan.blocks.findIndex((x) => order.indexOf(x.type) > order.indexOf(lib.block));
            s.plan.blocks.splice(at < 0 ? s.plan.blocks.length : at, 0, b);
          }
          b.items.push(C.normalizePlanItem({ name: lib.name }, lib.block));
        }
        changes.push(`Added ${lib.name} to ${targets.length === p.sessions.length ? 'every session' : targets.map((s) => DAY_LABEL[s.day]).join(', ')}`);
        continue;
      }
      // N sets of X / X for N sets
      if ((m = c.match(/^(?:do\s+|make it\s+)?(\w+)\s+sets?\s+(?:of|on|for)\s+(.+)$/)) || (m = c.match(/^(.+?)\s+(?:for|at|to)\s+(\w+)\s+sets?$/))) {
        const [n, what] = num(m[1]) != null ? [num(m[1]), m[2]] : [num(m[2]), m[1]];
        const name = n != null && findName(what, inProgram());
        if (!name) { unknown.push(raw); continue; }
        for (const { i } of allItems(p)) if (i.name === name) i.sets = Math.max(1, Math.min(10, n));
        changes.push(`${name}: ${n} sets`);
        continue;
      }
      // more/fewer sets / volume [on X]
      if ((m = c.match(/^(more|less|fewer|lower|higher|reduce|cut|increase)\s+(?:the\s+)?(sets|volume|reps)(?:\s+(?:on|for)\s+(.+))?$/))) {
        const up = /more|higher|increase/.test(m[1]);
        const name = m[3] ? findName(m[3], inProgram()) : null;
        if (m[3] && !name) { unknown.push(raw); continue; }
        let n = 0;
        for (const { b, i } of allItems(p)) {
          if (name ? i.name !== name : !['strength', 'power', 'conditioning', 'core'].includes(b.type)) continue;
          if (m[2] === 'reps') { if (i.measure === 'reps') i.amount = Math.max(1, i.amount + (up ? 2 : -2)), n++; }
          else { const before = i.sets; i.sets = Math.max(1, Math.min(10, i.sets + (up ? 1 : -1))); n += i.sets !== before; }
        }
        changes.push(`${up ? 'More' : 'Less'} ${m[2] === 'reps' ? 'reps' : 'volume'}${name ? ` on ${name}` : ''}: ${m[2] === 'reps' ? `${up ? '+' : '−'}2 reps` : `${up ? '+' : '−'}1 set`} on ${n} exercise${n === 1 ? '' : 's'}`);
        continue;
      }
      // heavier / lighter [X]
      if ((m = c.match(/^(?:make\s+)?(?:(.+?)\s+)?(heavier|lighter)(?:\s+(?:on\s+)?(.+))?$/))) {
        const up = m[2] === 'heavier';
        const what = [m[3], m[1]].map((x) => (x || '').replace(/^(it|everything|things|the program|all)$/, '')).find(Boolean) || null;
        const name = what ? findName(what, inProgram()) : null;
        if (what && !name) { unknown.push(raw); continue; }
        let n = 0;
        for (const { i } of allItems(p)) {
          if (name && i.name !== name) continue;
          if (i.loadType === 'pct') i.loadValue = Math.max(30, Math.min(100, i.loadValue + (up ? 5 : -5))), n++;
          else if (i.loadType === 'weight') i.loadValue = Math.max(0, +(i.loadValue + (up ? 2.27 : -2.27)).toFixed(2)), n++;
          else if (i.loadType === 'rpe') i.loadValue = Math.max(5, Math.min(10, i.loadValue + (up ? 0.5 : -0.5))), n++;
        }
        changes.push(`${up ? 'Heavier' : 'Lighter'}${name ? ` ${name}` : ''}: ${up ? '+' : '−'}5% (or 5 lb) on ${n} lift${n === 1 ? '' : 's'}`);
        continue;
      }
      // N weeks
      if ((m = c.match(/^(?:make it\s+|make the program\s+|run it for\s+)?(\w+)\s+weeks?(?:\s+long)?$/)) && num(m[1])) {
        p.weeks = Math.max(1, Math.min(16, num(m[1])));
        changes.push(`Length: ${p.weeks} weeks`);
        continue;
      }
      // move DAY to DAY
      if ((m = c.match(/^(?:move|shift|put)\s+(?:the\s+)?(\w+)(?:\s+session|\s+workout)?\s+to\s+(\w+)$/)) && dayOf(m[1]) != null && dayOf(m[2]) != null) {
        const s = p.sessions.find((x) => x.day === dayOf(m[1]));
        if (!s) { unknown.push(raw); continue; }
        s.day = dayOf(m[2]);
        p.sessions.sort((a, b) => a.day - b.day);
        changes.push(`Moved ${s.plan.name} from ${DAY_LABEL[dayOf(m[1])]} to ${DAY_LABEL[s.day]}`);
        continue;
      }
      // shorter sessions / under N minutes
      if ((m = c.match(/^(?:make\s+(?:it|them|the sessions|sessions)\s+)?(?:shorter|quicker|faster sessions|shorter sessions|(?:keep\s+(?:it|them|sessions)\s+)?(?:under|less than|max|at most)\s+(\d+)\s*(?:min|mins|minutes))$/))) {
        const cap = m[1] ? +m[1] : null;
        let cut = 0;
        for (const s of p.sessions) {
          const goal = cap || C.estimateMinutes(s.plan) - 15;
          // Trim accessory work first (conditioning, core, cool-down), keeping the main lifts.
          const KEEP = { conditioning: 0, core: 0, mobility: 0, cooldown: 0, speed: 1, plyo: 1, warmup: 1, power: 1, strength: 2 };
          for (const [type, keep] of Object.entries(KEEP)) {
            for (const b of [...s.plan.blocks].reverse().filter((x) => x.type === type)) {
              while (b.items.length > keep && C.estimateMinutes(s.plan) > goal) b.items.pop(), cut++;
            }
          }
          s.plan.blocks = s.plan.blocks.filter((b) => b.items.length);
        }
        changes.push(`Shorter sessions: removed ${cut} accessory exercise${cut === 1 ? '' : 's'}`);
        continue;
      }
      // rename / call it X
      if ((m = String(raw).match(/^(?:rename(?: it)?(?: to)?|call it)\s+["“]?(.+?)["”]?$/i))) {
        p.name = m[1].slice(0, 80);
        changes.push(`Renamed to “${p.name}”`);
        continue;
      }
      unknown.push(raw);
    }
    return { program: p, changes, unknown };
  }

  const titleCase = (s) => { const t = clean(s); return t ? t[0].toUpperCase() + t.slice(1) : null; };

  // Keep the prescription shape when swapping, but take the new lift's own defaults for measure.
  function swapItem(i, name) {
    const lib = C.libraryEntry(name);
    const fresh = C.normalizePlanItem({ name }, lib ? lib.block : 'strength');
    const same = fresh.measure === i.measure && (fresh.loadType === i.loadType || !['bw', 'none'].includes(fresh.loadType));
    const out = same ? { ...i, name: fresh.name, eachSide: fresh.eachSide } : { ...fresh, id: i.id, group: i.group, sets: i.sets, notes: i.notes };
    delete out.formFix;
    // A %1RM load doesn't carry over to a different lift's max; use its default instead.
    if (out.loadType === 'pct' && fresh.loadType !== 'pct') Object.assign(out, { loadType: fresh.loadType, loadValue: fresh.loadValue });
    return out;
  }

  // Compact text version of a program for Claude.
  function toText(p) {
    return JSON.stringify({
      name: p.name, description: p.description, phase: p.phase, weeks: p.weeks, progression: p.progression,
      sessions: p.sessions.map((s) => ({ day: s.day, name: s.plan.name, blocks: s.plan.blocks.map((b) => ({ type: b.type, title: b.title, items: b.items.map(({ name, group, sets, measure, amount, loadType, loadValue, restSec, tempo, eachSide, notes }) => ({ name, group, sets, measure, amount, loadType, loadValue, restSec, tempo, eachSide, notes })) })) })),
    });
  }

  // What changed between two programs, for showing Claude's edit before it's kept.
  function diff(a, b) {
    const out = [];
    if (a.weeks !== b.weeks) out.push(`Length: ${a.weeks} → ${b.weeks} weeks`);
    const names = (p) => new Set(allItems(p).map((x) => x.i.name));
    const A = names(a), B = names(b);
    const added = [...B].filter((n) => !A.has(n)), removed = [...A].filter((n) => !B.has(n));
    if (added.length) out.push(`Added: ${added.join(', ')}`);
    if (removed.length) out.push(`Removed: ${removed.join(', ')}`);
    const days = (p) => p.sessions.map((s) => DAY_LABEL[s.day]).join(', ');
    if (days(a) !== days(b)) out.push(`Days: ${days(a)} → ${days(b)}`);
    const sets = (p) => allItems(p).reduce((t, x) => t + x.i.sets, 0);
    if (sets(a) !== sets(b)) out.push(`Total sets per week: ${sets(a)} → ${sets(b)}`);
    return out.length ? out : ['Prescriptions adjusted'];
  }

  const EXAMPLES = ['swap bench for dumbbell bench', 'add a set to squats', 'no jumping', 'remove deadlift on Friday', 'add Copenhagen plank', 'make it 6 weeks', 'keep sessions under 45 minutes', 'lighter squats', 'move Wednesday to Thursday'];

  const ProgramEdit = { apply, findName, clauses, toText, diff, EXAMPLES };
  if (node) module.exports = ProgramEdit;
  else root.ProgramEdit = ProgramEdit;
})(typeof window !== 'undefined' ? window : globalThis);
