/**
 * Check a learner's marks against the courses in the database.
 *
 * Usage (from backend/):
 *   npm run check -- samples/strong-science.json
 *   npm run check -- samples/strong-science.json --uni UJ --show close
 *
 * Options:
 *   --uni UJ,WSU     limit to these universities (default: all)
 *   --year 2027      intake year (default: 2027)
 *   --show LIST      statuses to list: qualifies,check,close,not_eligible (default: qualifies,check,close)
 */
import { readFile } from 'node:fs/promises';
import { evaluateAll } from '../eligibility.js';
import { createPool, loadCourses, loadRules } from '../repository.js';

function parseArgs(argv) {
  const args = { file: null, uni: null, year: 2027, show: ['qualifies', 'check', 'close'] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uni') args.uni = argv[++i].split(',');
    else if (a === '--year') args.year = Number(argv[++i]);
    else if (a === '--show') args.show = argv[++i].split(',');
    else args.file = a;
  }
  if (!args.file) throw new Error('Usage: npm run check -- <marks.json> [--uni UJ] [--year 2027] [--show qualifies,close]');
  return args;
}

const LABEL = { qualifies: 'QUALIFIES', check: 'CHECK WITH UNIVERSITY', close: 'CLOSE', not_eligible: 'NOT ELIGIBLE' };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const marks = JSON.parse(await readFile(args.file, 'utf8'));

  const pool = createPool();
  try {
    const [rules, courses] = await Promise.all([
      loadRules(pool, args.year, { universities: args.uni }),
      loadCourses(pool, args.year, { universities: args.uni }),
    ]);
    const { apsByUniversity, results } = evaluateAll(courses, rules, marks);

    console.log(`\nMarks: ${Object.entries(marks).map(([s, m]) => `${s} ${m}%`).join(', ')}`);
    for (const [uni, { aps, counted }] of Object.entries(apsByUniversity)) {
      console.log(`APS at ${uni}: ${aps}  (${counted.map((c) => `${c.subject} ${c.points}`).join(' + ')})`);
    }

    const counts = {};
    for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
    console.log(`\nSummary: ${Object.entries(LABEL).map(([k, l]) => `${l} ${counts[k] ?? 0}`).join(' | ')}`);

    for (const status of args.show) {
      const list = results.filter((r) => r.status === status);
      if (!list.length) continue;
      console.log(`\n== ${LABEL[status]} (${list.length}) ==`);
      for (const r of list) {
        console.log(`  [${r.university}] ${r.name}  (APS ${r.aps}/${r.requiredAps ?? '?'})`);
        if (status !== 'qualifies') for (const reason of r.reasons) console.log(`      - ${reason}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
