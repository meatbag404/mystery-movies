'use strict';

const assert = require('assert');
const { parseThread, mergeScreenings } = require('../src/parse.js');

let passed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; return; }
  console.error('FAIL:', name, extra != null ? JSON.stringify(extra) : '');
  process.exitCode = 1;
};
const byNum = (list) => Object.fromEntries(list.map((e) => [e.number, e]));

/* ---- Variant A: old AMC (### headers, rating in bold, Best Guess Confirmed) ---- */
const AMC_OLD = `
###[1.***Next Goal Wins - PG-13*** - Searchlight - Nov 06 2023](https://www.amctheatres.com/movies/amc-screen-unseen-november-6-75135)

- **ARR**-1h49m **AR**-1h43m
- [Nov 6th ASU Thread](https://www.reddit.com/r/AMCsAList/s/Tmcr9IUnaK)

###[6.***Out Of Darkness - R*** - Bleecker Street - Jan 29 2024](https://www.amctheatres.com/movies/amc-scream-unseen-january-29-75764)

- **Scream Unseen**
- **ARR**-1h30m **AR**-1h27m
- [Jan 29th ASU Thread](https://www.reddit.com/r/AMCsAList/s/lFoah4Y5CF)

###[21.***Rated R*** - 1h53m - July 22 2024](https://www.amctheatres.com/movies/amc-screen-unseen-july-22-77557)

- **ARR**-1h53m **AR**-TBD
- [July 22nd ASU Thread](https://www.reddit.com/r/AMCsAList/s/1yamP9K6Wh)
- Best Guess: >!Kneecap!< Confirmed!

###[22.***Rated R*** - 1h41m - August 12 2024](https://www.amctheatres.com/movies/amc-screen-unseen-august-12-77690)

- **ARR**-1h41m **AR**-TBD
- Best Guess: >!TBD!<
`;

/* ---- Variant B: old Regal (### headers, NO rating, Best Guess Confirmed) ---- */
const REGAL_OLD = `
###1.***The Greatest Beer Run Ever*** - Apple - Sept 26 2022

- **RRR**-2h20m **AR**-2h6m

###[13.***Gran Turismo*** - PlayStation Productions/Sony - July 24 2023](https://www.reddit.com/r/RegalUnlimited/comments/162dqhd/x/)

- **RRR**-2h24m **AR**-2h15m

###[36.***Rated R*** - 2h3m - June 17 2024](https://www.regmovies.com/movies/monday-mystery-movie-0617-ho00016756)

- **RRR**-2h3m **AR**-TBD
- Best Guess: >!The Bikeriders!< Confirmed!

###[37.***Rated PG-13*** - 2h22m - July 1 2024](https://www.regmovies.com/movies/x)

- **RRR**-2h22m **AR**-TBD
- Best Guess: >!TBD!<
`;

/* ---- Variant C: current AMC (no ###, rating glued, Revealed As) ---- */
const AMC_NEW = `
[85.***Young Washington -PG-13*** - Angel Studios - June 22 2026](https://www.amctheatres.com/movies/amc-screen-unseen-june-22-84155)
- **ARR**-2h10m **AR**-2h5m
- [June 22nd ASU Thread](https://www.reddit.com/r/AMCsAList/s/StlPbGZvXy)

[87.***Motor City -R*** - IFC - July 20 2026](https://www.amctheatres.com/movies/amc-screen-unseen-july-20-84361)
- **ARR**-1h46m **AR**-1h43m
- [July 20th ASU Thread](https://www.reddit.com/r/AMCsAList/s/p0OMZLQlrn)

[88.***Rated R*** - 1h47m - July 27 2026](https://www.amctheatres.com/movies/amc-screen-unseen-july-27-84362)
- **ARR**-1h47m **AR**-TBD
- [July 27th ASU Thread](https://www.reddit.com/r/AMCsAList/s/lAiw6tIoNV)
- Revealed As: >!TBD!<
`;

/* ---- Variant D: current Regal (no ###, rating as segment, Revealed As) ---- */
const REGAL_NEW = `
88.***The Sheep Detectives - PG*** - Amazon MGM - May 3 2026

- Sunday Mystery Movie
- **RRR**-2h4m **AR**-1h50m

[93.***Rated R*** - 1h44m - July 27 2026](https://www.regmovies.com/movies/monday-mystery-movie-727-ho00022067?date=07-27-2026)

- **RRR**-1h44m **AR**-TBD
- Revealed As: >!TBD!<
`;

/* ===================== Variant A ===================== */
{
  const e = byNum(parseThread(AMC_OLD, { chain: 'AMC' }));
  check('AMC_OLD #1 title', e[1].title === 'Next Goal Wins', e[1]);
  check('AMC_OLD #1 rating', e[1].rating === 'PG-13', e[1]);
  check('AMC_OLD #1 distributor', e[1].distributor === 'Searchlight', e[1]);
  check('AMC_OLD #1 date', e[1].date === '2023-11-06', e[1]);
  check('AMC_OLD #1 runtimes', e[1].reportedRuntime === '1h49m' && e[1].actualRuntime === '1h43m', e[1]);
  check('AMC_OLD #1 url', e[1].url && e[1].url.includes('amctheatres'), e[1]);
  check('AMC_OLD #6 rating R', e[6].rating === 'R', e[6]);
  check('AMC_OLD #21 spoiler title', e[21].title === 'Kneecap', e[21]);
  check('AMC_OLD #21 identified', e[21].identified === true, e[21]);
  check('AMC_OLD #21 actualRuntime null (TBD)', e[21].actualRuntime === null, e[21]);
  check('AMC_OLD #22 placeholder unidentified', e[22].identified === false, e[22]);
}

/* ===================== Variant B ===================== */
{
  const e = byNum(parseThread(REGAL_OLD, { chain: 'Regal' }));
  check('REGAL_OLD #1 title', e[1].title === 'The Greatest Beer Run Ever', e[1]);
  check('REGAL_OLD #1 no rating', e[1].rating === null, e[1]);
  check('REGAL_OLD #1 distributor', e[1].distributor === 'Apple', e[1]);
  check('REGAL_OLD #1 date', e[1].date === '2022-09-26', e[1]);
  check('REGAL_OLD #13 title', e[13].title === 'Gran Turismo', e[13]);
  check('REGAL_OLD #13 distributor', e[13].distributor === 'PlayStation Productions/Sony', e[13]);
  check('REGAL_OLD #36 spoiler title', e[36].title === 'The Bikeriders', e[36]);
  check('REGAL_OLD #36 identified', e[36].identified === true, e[36]);
  check('REGAL_OLD #37 unidentified', e[37].identified === false, e[37]);
}

/* ===================== Variant C ===================== */
{
  const e = byNum(parseThread(AMC_NEW, { chain: 'AMC' }));
  check('AMC_NEW #85 title', e[85].title === 'Young Washington', e[85]);
  check('AMC_NEW #85 rating', e[85].rating === 'PG-13', e[85]);
  check('AMC_NEW #87 title', e[87].title === 'Motor City', e[87]);
  check('AMC_NEW #87 identified', e[87].identified === true, e[87]);
  check('AMC_NEW #88 placeholder', e[88].identified === false, e[88]);
  check('AMC_NEW #88 title is Rated R', e[88].title === 'Rated R', e[88]);
}

/* ===================== Variant D ===================== */
{
  const e = byNum(parseThread(REGAL_NEW, { chain: 'Regal' }));
  check('REGAL_NEW #88 title', e[88].title === 'The Sheep Detectives', e[88]);
  check('REGAL_NEW #88 rating', e[88].rating === 'PG', e[88]);
  check('REGAL_NEW #88 notes', e[88].notes && e[88].notes[0] === 'Sunday Mystery Movie', e[88]);
  check('REGAL_NEW #93 unidentified', e[93].identified === false, e[93]);
}

/* ===================== Merge across overlapping windows ===================== */
{
  // Same film #21: placeholder-with-confirmed-spoiler in the old thread,
  // and later re-listed with a real title + real runtime. Merge should keep
  // the fully-resolved version.
  const older = parseThread(AMC_OLD, { chain: 'AMC' }); // #21 -> Kneecap, AR null
  const newer = [{ chain: 'AMC', number: 21, title: 'Kneecap', rating: 'R', distributor: 'Sony Classics', date: '2024-07-22', reportedRuntime: '1h53m', actualRuntime: '1h45m', identified: true }];
  const merged = byNum(mergeScreenings([older, newer]));
  check('MERGE #21 keeps actual runtime', merged[21].actualRuntime === '1h45m', merged[21]);
  check('MERGE #21 keeps distributor', merged[21].distributor === 'Sony Classics', merged[21]);
  check('MERGE dedupes to one #21', mergeScreenings([older, newer]).filter((x) => x.number === 21).length === 1);
}

console.log(passed + ' checks passed');
