'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { diffReveals, key } = require('../src/extract.js');

let passed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; return; }
  console.error('FAIL:', name, extra != null ? JSON.stringify(extra) : '');
  process.exitCode = 1;
};

/* ---- diffReveals: new + retitled + unchanged ---- */
{
  const prev = new Map([
    ['AMC#87', { chain: 'AMC', number: 87, title: 'Motor City' }],
    ['AMC#88', { chain: 'AMC', number: 88, title: 'Rated R' }], // was placeholder-ish in prev
  ].map(([k, v]) => [k, v]));
  const identified = [
    { chain: 'AMC', number: 87, title: 'Motor City' },              // unchanged -> no reveal
    { chain: 'AMC', number: 88, title: 'Kneecap' },                 // retitled -> reveal
    { chain: 'AMC', number: 89, title: 'Some New Film' },           // new -> reveal
  ];
  const reveals = diffReveals(prev, identified);
  check('diff: two reveals', reveals.length === 2, reveals);
  check('diff: #88 retitled', reveals.find((r) => r.number === 88)?.why.startsWith('retitled'), reveals);
  check('diff: #89 new', reveals.find((r) => r.number === 89)?.why === 'new', reveals);
  check('diff: #87 not reported', !reveals.find((r) => r.number === 87), reveals);
}

/* ---- --file mode end to end (parse + filter identified) ---- */
{
  const selftext = [
    '[87.***Motor City -R*** - IFC - July 20 2026](https://www.amctheatres.com/movies/x)',
    '- **ARR**-1h46m **AR**-1h43m',
    '- [July 20th ASU Thread](https://www.reddit.com/r/AMCsAList/s/x)',
    '',
    '[88.***Rated R*** - 1h47m - July 27 2026](https://www.amctheatres.com/movies/y)',
    '- **ARR**-1h47m **AR**-TBD',
    '- Revealed As: >!TBD!<',
  ].join('\n');
  const fixture = { kind: 'Listing', data: { children: [{ kind: 't3', data: { title: 'AMC Screen Unseen Megathread', selftext } }] } };
  const tmp = path.join(os.tmpdir(), `mm-fixture-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(fixture));

  const outText = execFileSync('node', [path.join(__dirname, '..', 'src', 'extract.js'), '--file', tmp, '--chain', 'AMC'], { encoding: 'utf8' });
  const out = JSON.parse(outText);
  fs.unlinkSync(tmp);

  check('--file: only identified emitted', out.length === 1, out);
  check('--file: #87 present', out[0].number === 87 && out[0].title === 'Motor City', out);
  check('--file: internal flag stripped', !('identified' in out[0]), out[0]);
}

console.log(passed + ' checks passed');
