// Every sport × goal × experience × age group: generated programs must suit the athlete.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const P = require('../src/program.js');
const S = require('../src/sports.js');
const PLUS = require('../src/exercises-plus.js');

const GOALS = Object.keys(P.GOALS);
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const AGES = [{ age: 11 }, { age: 16 }, { age: 24 }];
const names = (p) => p.sessions.flatMap((s) => s.plan.blocks.flatMap((b) => b.items.map((i) => i.name)));
const pats = (p) => new Set(names(p).map((n) => P.meta(n).pattern));
const SWIM = ['swim', 'open-water', 'water-polo', 'diving', 'artistic-swim'];

test('every sport has a profile', () => {
  for (const id of C.SPORTS) {
    const prof = S.profile(id);
    assert.ok(prof && prof.family && S.FAMILIES[prof.family], `${id} has a family`);
    assert.ok(prof.cond.length, `${id} has conditioning`);
  }
});

test('sport × goal × level × age matrix', () => {
  let n = 0;
  const fails = [];
  const check = (ok, msg) => ok || fails.push(msg);
  for (const sport of C.SPORTS) {
    const prof = S.profile(sport);
    for (const goal of GOALS) {
      for (const experience of LEVELS) {
        for (const a of AGES) {
          const days = (n % 5) + 2;
          const p = P.generateProgram({ sport, goal, experience, daysPerWeek: days, minutes: 60, weeks: 4, ...a });
          const tag = `${sport}/${goal}/${experience}/${a.age}/${days}d`;
          const all = names(p);
          const lim = S.limits({ age: a.age, experience, goal, phase: p.phase });
          n++;
          check(goal === 'in-season' ? p.sessions.length <= days : p.sessions.length === days, `${tag}: ${p.sessions.length} sessions`);
          check(all.every((x) => C.libraryEntry(x)), `${tag}: unknown exercise`);
          // No running for swimmers.
          if (prof.noPatterns.includes('run')) check(!all.some((x) => ['run', 'sprint', 'drill', 'cod'].includes(P.meta(x).pattern)), `${tag}: running for a swimmer: ${all.filter((x) => ['run', 'sprint', 'drill', 'cod'].includes(P.meta(x).pattern))}`);
          // No Olympic lifts or level-3 work for beginners, youth or rehab.
          check(all.every((x) => P.level(x) <= lim.maxLevel), `${tag}: too advanced: ${all.filter((x) => P.level(x) > lim.maxLevel)}`);
          if (experience === 'beginner' || a.age < 13) check(!all.some((x) => ['Power clean', 'Hang clean', 'Hang snatch', 'Clean pull', 'Depth jump'].includes(x)), `${tag}: Olympic lift for a beginner`);
          // Arm care for throwing and overhead sports.
          if (prof.arm && goal !== 'endurance') check(all.some((x) => S.ARM_CARE.includes(x)), `${tag}: no arm care`);
          // Braking and landing work for team sports.
          if (prof.decel && !['endurance', 'hypertrophy'].includes(goal) && !(goal === 'in-season' && days < 3)) check(all.some((x) => S.DECEL.includes(x) || /stick|decel|landing|snap-down/i.test(x)), `${tag}: no decel/landing`);
          // Weekly squat, hinge, single-leg, push and pull (unless the request restricts them).
          if (days >= 2 && goal !== 'in-season') {
            const ps = pats(p);
            for (const need of [['squat'], ['hinge'], ['lunge'], ['push-h', 'push-v'], ['pull-h', 'pull-v']]) check(need.some((x) => ps.has(x)), `${tag}: no ${need[0]}`);
          }
          // Age- and level-appropriate jump and sprint volume.
          const cs = p.sessions.map((s) => S.counts(s.plan, P.meta));
          check(cs.every((x) => x.jumps <= lim.jumpsPerSession), `${tag}: ${Math.max(...cs.map((x) => x.jumps))} jumps in a session (limit ${lim.jumpsPerSession})`);
          check(cs.reduce((t, x) => t + x.jumps, 0) <= lim.jumpsPerWeek, `${tag}: weekly jumps over ${lim.jumpsPerWeek}`);
          check(cs.every((x) => x.sprint <= lim.sprintPerSession), `${tag}: sprint over ${lim.sprintPerSession} m`);
          // Nothing it generates should trigger its own warnings.
          const w = P.checkProgram(p, { age: a.age }).filter((x) => x.level === 'warn' && x.id !== 'arm-care' && x.id !== 'decel');
          check(!w.length, `${tag}: warnings ${w.map((x) => x.id)}`);
          // Every generated item explains itself.
          check(p.sessions.every((s) => s.plan.blocks.every((b) => b.items.every((i) => i.why))), `${tag}: item without a why`);
        }
      }
    }
  }
  assert.ok(n > 1000);
  if (process.env.MATRIX_DUMP) require('fs').writeFileSync(process.env.MATRIX_DUMP, fails.join('\n'));
  assert.deepEqual(fails.slice(0, 15), [], `${fails.length} failures`);
});

test('sport specifics show up', () => {
  const g = P.generateProgram({ sport: 'golf', goal: 'power', daysPerWeek: 3 });
  assert.ok(!names(g).some((x) => P.meta(x).pattern === 'sprint'), 'golfers do not sprint');
  assert.ok(names(g).some((x) => S.ROT.includes(x)), 'golfers get rotational power');
  const sw = P.generateProgram({ sport: 'swim', goal: 'general', daysPerWeek: 3, equipment: ['dumbbell', 'band'] });
  assert.ok(names(sw).some((x) => P.meta(x).pattern === 'swim' || /swim/i.test(x)) || names(sw).some((x) => S.ARM_CARE.includes(x)));
  const bb = P.generateProgram({ sport: 'baseball', position: 'Pitcher', goal: 'strength', daysPerWeek: 4 });
  assert.ok(!names(bb).some((x) => ['Overhead press', 'Push press'].includes(x)), 'pitchers skip heavy overhead pressing');
  assert.equal(bb.builtFor.position, 'pitcher');
  const fb = P.generateProgram({ sport: 'football', goal: 'strength', daysPerWeek: 3, experience: 'advanced' });
  assert.ok(names(fb).some((x) => /neck/i.test(x)), 'football gets neck work');
  const kid = P.generateProgram({ sport: 'basketball', goal: 'power', age: 10, daysPerWeek: 3 });
  assert.ok(!names(kid).some((x) => P.level(x) > 1));
  assert.equal(kid.builtFor.ageGroup, 'youth');
});

test('checkProgram flags problems and applyFix fixes them', () => {
  const it = (name, extra = {}) => C.normalizePlanItem({ name, ...extra }, 'strength');
  const prog = P.normalizeProgram({
    name: 'Hand-made', weeks: 4, equipment: [],
    sessions: [
      { day: 0, plan: C.normalizePlan({ name: 'Day 1', blocks: [{ type: 'strength', items: [it('Power clean'), it('Back squat')] }, { type: 'conditioning', items: [it('Tempo runs (110s)')] }, { type: 'plyo', items: [it('Depth jump', { sets: 10, amount: 10 })] }] }) },
      { day: 2, plan: C.normalizePlan({ name: 'Day 2', blocks: [{ type: 'strength', items: [it('Bench press')] }] }) },
    ],
  });
  const ctx = { sport: 'swim', experience: 'beginner', age: 15 };
  const w = P.checkProgram(prog, ctx);
  const ids = w.map((x) => x.id);
  for (const id of ['sport-fit', 'level', 'arm-care', 'coverage', 'jumps']) assert.ok(ids.includes(id), `flags ${id}`);
  assert.ok(w.every((x) => x.text && x.fix && x.fix.label));
  let fixed = prog;
  for (const id of ids) fixed = P.applyFix(fixed, id, ctx);
  const left = P.checkProgram(fixed, ctx).map((x) => x.id);
  assert.deepEqual(left, [], `still: ${left}`);
  assert.ok(names(prog).includes('Power clean'), 'original untouched');
  const team = P.checkProgram(prog, { sport: 'soccer', experience: 'intermediate' }).map((x) => x.id);
  assert.ok(team.includes('decel'));
  assert.ok(P.checkProgram(P.applyFix(prog, 'decel', { sport: 'soccer' }), { sport: 'soccer' }).every((x) => x.id !== 'decel'));
});

test('library: every new exercise is complete and linked', () => {
  assert.ok(C.EXERCISE_LIBRARY.length >= 260);
  for (const x of PLUS.ALL) {
    assert.ok(x.setup && x.cues.length === 3 && x.avoid && x.pattern && Array.isArray(x.equip), x.name);
    assert.ok(P.PATTERNS[x.pattern], `${x.name} pattern ${x.pattern}`);
    assert.ok(x.equip.every((e) => P.EQUIPMENT[e]), `${x.name} equipment`);
    const l = P.links(x.name);
    if (x.reg) assert.ok(l.easier, `${x.name} easier ${x.reg}`);
    if (x.prog) assert.ok(l.harder, `${x.name} harder ${x.prog}`);
  }
  assert.equal(P.links('Back squat').easier !== undefined, true);
});
