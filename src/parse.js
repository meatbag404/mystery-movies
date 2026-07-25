'use strict';

/**
 * Parser for the AMC "Screen Unseen" and Regal "Monday Mystery Movie"
 * megathread post bodies (Reddit "selftext" markdown).
 *
 * The mod's formatting has drifted over the ~2 years these threads have run,
 * so this parser is deliberately tolerant. Observed variants it handles:
 *
 *   - Entry headers with or without a leading "###" (H3):
 *       ###[1.***Next Goal Wins - PG-13*** - Searchlight - Nov 06 2023](url)
 *       88.***The Sheep Detectives - PG*** - Amazon MGM - May 3 2026
 *   - Rating as its own " - PG" segment (Regal), glued to the title as " -R"
 *     (current AMC), or absent entirely (old Regal).
 *   - The header optionally wrapped as a markdown link [ ... ](url).
 *   - Reveal markers, old and new:
 *       - Revealed As: >!TBD!<              (current: still a placeholder)
 *       - Best Guess: >!The Bikeriders!< Confirmed!   (old: confirmed title in spoiler)
 *     A film can be CONFIRMED via the spoiler while its title field still reads
 *     "Rated R" and its actual runtime is TBD, so identification cannot rely on
 *     the absence of the string "TBD".
 *
 * An entry is "identified" when we can name the actual film — either the title
 * field is a real title (not a "Rated X" placeholder) or a confirmed spoiler
 * title is present.
 */

const RATINGS = ['NC-17', 'PG-13', 'PG', 'R', 'G', 'NR']; // longest first for alternation
const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08',
  sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

const stripEmphasis = (s) => s.replace(/\*+/g, '').trim();
const stripHeading = (s) => s.replace(/^#+\s*/, '');

function unwrapLink(line) {
  const m = line.match(/^\[(.+)\]\(([^)]*)\)\s*$/);
  if (m) return { text: m[1], url: /^https?:\/\//.test(m[2]) ? m[2] : null };
  return { text: line, url: null };
}

function toISODate(str) {
  const m = str.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/);
  if (!m) return str.trim();
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return str.trim();
  return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
}

// A title like "Rated R" / "Rated PG-13" is a placeholder, not a real film name.
const isPlaceholderTitle = (t) => !t || /^Rated\s+(NC-17|PG-13|PG|R|G|NR)$/i.test(t.trim());

function extractRating(parts) {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (RATINGS.includes(parts[i].toUpperCase())) return parts.splice(i, 1)[0].toUpperCase();
  }
  const re = new RegExp(`\\s-\\s*(${RATINGS.join('|')})$`, 'i');
  const hit = parts[0] && parts[0].match(re);
  if (hit) {
    parts[0] = parts[0].replace(re, '').trim();
    return hit[1].toUpperCase();
  }
  return null;
}

function parseDetails(bulletLines) {
  const blob = bulletLines.map((l) => stripEmphasis(l)).join('\n');
  const reported = blob.match(/(?:ARR|RRR)-\s*([0-9hm]+)/i);
  const actual = blob.match(/(?:^|[^A-Z])AR-\s*([0-9hm]+|TBD)/i);
  // Reveal marker: "Revealed As: >!X!<" or "Best Guess: >!X!< Confirmed!"
  const reveal = blob.match(/(?:Revealed As|Best Guess):\s*>?!?\s*(.+?)\s*!?<?\s*(Confirmed!?)?\s*$/im);
  let revealedTitle = null;
  if (reveal) {
    const t = reveal[1].replace(/[><!]/g, '').trim();
    if (t && !/^TBD$/i.test(t)) revealedTitle = t;
  }
  const notes = [];
  for (const raw of bulletLines) {
    const t = stripEmphasis(raw).replace(/^[-*]\s*/, '').trim();
    if (!t) continue;
    if (/^(ARR|RRR|AR)-/i.test(t)) continue;
    if (/^(Revealed As|Best Guess):/i.test(t)) continue;
    if (/Thread\]?\(|Thread$/i.test(raw)) continue;
    if (/^(Sunday Mystery Movie|Scream Unseen|Screen Unseen)$/i.test(t)) notes.push(t);
  }
  return {
    reportedRuntime: reported ? reported[1] : null,
    actualRuntime: actual ? actual[1] : null,
    revealedTitle,
    notes,
  };
}

function parseThread(selftext, meta = {}) {
  const lines = String(selftext).split('\n');
  const entries = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const details = parseDetails(current.bullets);
    const descriptor = current.headerText.replace(/^\d+\.\s*/, '').trim();
    const parts = descriptor.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);

    let date = null, distributor = null, rating = null;
    if (parts.length) date = toISODate(parts.pop());
    // Placeholder headers carry a bare runtime segment where a real entry has a
    // distributor, e.g. "Rated R - 1h47m - July 27 2026". Drop those so they
    // pollute neither the distributor nor the title.
    const isRuntime = (s) => /^\d+h(\d+m)?$|^\d+m$/i.test(s);
    while (parts.length && isRuntime(parts[parts.length - 1])) parts.pop();
    if (parts.length > 1) distributor = parts.pop();
    rating = extractRating(parts);
    let title = parts.join(' - ').trim() || null;

    const placeholder = isPlaceholderTitle(title);
    if (placeholder && details.revealedTitle) title = details.revealedTitle;
    const identified = !isPlaceholderTitle(title);

    entries.push({
      chain: meta.chain || null,
      number: current.number,
      title,
      rating,
      distributor,
      date,
      reportedRuntime: details.reportedRuntime,
      actualRuntime: details.actualRuntime && !/TBD/i.test(details.actualRuntime) ? details.actualRuntime : null,
      identified,
      ...(details.notes.length ? { notes: details.notes } : {}),
      ...(current.url ? { url: current.url } : {}),
    });
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const { text, url } = unwrapLink(stripHeading(trimmed));
    const stripped = stripEmphasis(text);
    const header = stripped.match(/^(\d+)\.(?!\d)\s*(.+)$/);
    const looksLikeEntry = header && /\d{4}\s*$/.test(stripped);

    if (looksLikeEntry) {
      flush();
      current = { number: parseInt(header[1], 10), headerText: stripped, url, bullets: [] };
    } else if (current && /^[-*]/.test(trimmed)) {
      current.bullets.push(rawLine);
    } else if (current && trimmed === '') {
      // blank line inside an entry block: keep the entry open
    } else if (current) {
      flush();
      current = null;
    }
  }
  flush();
  return entries;
}

/**
 * Merge entries from many threads (windows overlap). Keyed by chain+number.
 * Prefer the "most resolved" version: identified over not, a real actual
 * runtime over none, and — as a final tiebreak — the entry seen later
 * (later threads carry the mod's latest corrections).
 */
function score(e) {
  return (e.identified ? 4 : 0) + (e.actualRuntime ? 2 : 0) + (e.distributor ? 1 : 0);
}

function mergeScreenings(lists) {
  const byKey = new Map();
  for (const list of lists) {
    for (const e of list) {
      const key = `${e.chain}#${e.number}`;
      const prev = byKey.get(key);
      if (!prev || score(e) >= score(prev)) byKey.set(key, e);
    }
  }
  return [...byKey.values()].sort((a, b) => (a.chain === b.chain ? a.number - b.number : a.chain < b.chain ? -1 : 1));
}

module.exports = { parseThread, mergeScreenings, isPlaceholderTitle, toISODate };
