#!/usr/bin/env node
/*
 * Form checker accuracy report.
 *   node tools/accuracy.js            simulated reps with known faults (clean and with tracking noise)
 *   node tools/accuracy.js <folder>   labelled pose files exported from form checks (⬇ Pose data)
 */
const fs = require('node:fs');
const path = require('node:path');
const A = require('../src/accuracy.js');

const dir = process.argv[2];
let inputs;
if (dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  inputs = files.map((f) => A.fromExport(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f)).filter((x) => Object.keys(x.labels).length);
  if (!inputs.length) {
    console.error(`No labelled pose files in ${dir}. Set each "labels" entry to "good" or "bad" first.`);
    process.exit(1);
  }
} else {
  inputs = A.simInputs();
}
console.log(A.report(A.evaluate(inputs)));
