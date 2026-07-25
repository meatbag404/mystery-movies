#!/usr/bin/env node
'use strict';

/**
 * Extract identified AMC "Screen Unseen" / Regal "Monday Mystery Movie"
 * screenings from Reddit and maintain a versioned data file + changelog.
 *
 * Modes:
 *   node src/extract.js                 weekly update (default): find the newest
 *                                       thread per chain, merge into the data
 *                                       file, append any new reveals to the log
 *   node src/extract.js --backfill      one-time: rebuild full history from #1
 *                                       using the archive threads in config
 *   node src/extract.js --file post.json [--chain AMC]
 *                                       parse a saved reddit thread .json offline
 *   node src/extract.js --all           include not-yet-revealed placeholders
 *   node src/extract.js --dry-run       compute, print a summary, write nothing
 *
 * Output files (override dir with --out <dir>, default ./data):
 *   data/mystery-movies.json   { generatedAt, sources, screenings: [identified] }
 *   data/changelog.txt         one timestamped line per newly-revealed film
 */

const fs = require('fs');
const path = require('path');
const { parseThread, mergeScreenings } = require('./parse.js');
const { chains } = require('./config.js');

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : (process.argv[i + 1] || true);
}
const has = (flag) => process.argv.includes(flag);

const OUT_DIR = arg('--out') && typeof arg('--out') === 'string' ? arg('--out') : path.join(process.cwd(), 'data');
const DATA_FILE = path.join(OUT_DIR, 'mystery-movies.json');
const CHANGELOG = path.join(OUT_DIR, 'changelog.txt');
const INCLUDE_ALL = has('--all');
const DRY_RUN = has('--dry-run');

const key = (e) => `${e.chain}#${e.number}`;
const nowIso = () => new Date().toISOString();

/** New reveals = identified films absent from prev, or whose title changed. */
function diffReveals(prevByKey, identified) {
  const reveals = [];
  for (const e of identified) {
    const prev = prevByKey.get(key(e));
    if (!prev) reveals.push({ ...e, why: 'new' });
    else if (prev.title !== e.title) reveals.push({ ...e, why: `retitled from "${prev.title}"` });
  }
  return reveals;
}

function loadMaster() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { generatedAt: null, sources: [], screenings: [] };
  }
}

function stripInternal(e) {
  const { identified, ...rest } = e; // eslint-disable-line no-unused-vars
  return rest;
}

function summarize(screenings) {
  const byChain = {};
  for (const s of screenings) byChain[s.chain] = (byChain[s.chain] || 0) + 1;
  return Object.entries(byChain).map(([c, n]) => `${c}: ${n}`).join(', ');
}

// ---- offline: parse a single saved reddit .json file ------------------------
function runFile() {
  const file = arg('--file');
  const chain = (arg('--chain') && typeof arg('--chain') === 'string') ? arg('--chain') : 'Unknown';
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const post = Array.isArray(raw)
    ? raw[0].data.children[0].data
    : raw.data.children[0].data; // supports both /comments and /by_id shapes
  let entries = parseThread(post.selftext, { chain });
  if (!INCLUDE_ALL) entries = entries.filter((e) => e.identified);
  process.stdout.write(JSON.stringify(entries.map(stripInternal), null, 2) + '\n');
}

// ---- fetch + parse a set of threads ----------------------------------------
async function collect(client, chainCfg, ids) {
  const lists = [];
  const sources = [];
  for (const id of ids) {
    const post = await client.getPost(id);
    lists.push(parseThread(post.selftext, { chain: chainCfg.chain }));
    sources.push({ chain: chainCfg.chain, threadId: id, title: post.title });
  }
  return { lists, sources };
}

async function run() {
  if (arg('--file')) return runFile();

  const { createClient } = require('./reddit.js');
  const client = createClient();
  const backfill = has('--backfill');

  const master = loadMaster();
  const prevByKey = new Map(master.screenings.map((s) => [key(s), s]));

  const allLists = backfill ? [] : [master.screenings]; // seed weekly runs with known history
  const sources = [];

  for (const chainCfg of chains) {
    let ids = [];
    if (backfill) {
      ids = [...chainCfg.seedThreads];
    } else {
      const latest = await client.findLatestThread(chainCfg.discovery).catch(() => null);
      if (latest) ids = [latest.id];
      else {
        ids = [chainCfg.seedThreads[chainCfg.seedThreads.length - 1]];
        console.error(`WARN: discovery failed for ${chainCfg.chain}; falling back to ${ids[0]}`);
      }
    }
    const { lists, sources: s } = await collect(client, chainCfg, ids);
    allLists.push(...lists);
    sources.push(...s);
  }

  const merged = mergeScreenings(allLists);
  const identified = merged.filter((e) => e.identified);
  const reveals = diffReveals(prevByKey, identified);

  const out = {
    generatedAt: nowIso(),
    sources,
    screenings: identified.map(stripInternal),
  };

  console.log(`Parsed ${merged.length} entries (${summarize(identified)} identified). ${reveals.length} new reveal(s).`);
  for (const r of reveals) console.log(`  + ${r.chain} #${r.number}: ${r.title}${r.why === 'new' ? '' : ' (' + r.why + ')'}`);

  if (DRY_RUN) { console.log('(dry run — nothing written)'); return; }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(out, null, 2) + '\n');

  if (reveals.length) {
    const stamp = nowIso();
    let lines;
    if (backfill && reveals.length > 5) {
      // The first backfill imports the whole history at once; log one summary
      // line instead of hundreds so the changelog stays a record of reveals.
      lines = [`[${stamp}] backfill: imported ${identified.length} identified screenings (${summarize(identified)})`];
    } else {
      lines = reveals.map((r) => {
        const bits = [r.rating, r.distributor].filter(Boolean).join(', ');
        return `[${stamp}] ${r.chain} #${r.number} revealed: ${r.title}` +
          (bits ? ` (${bits})` : '') + (r.date ? ` — ${r.date}` : '') +
          (r.why === 'new' ? '' : ` [${r.why}]`);
      });
    }
    fs.appendFileSync(CHANGELOG, lines.join('\n') + '\n');
  }
  console.log(`Wrote ${DATA_FILE}${reveals.length ? ` and updated ${CHANGELOG}` : ''}.`);
}

if (require.main === module) {
  run().catch((err) => { console.error('Error:', err.message); process.exit(1); });
}

module.exports = { diffReveals, key };
