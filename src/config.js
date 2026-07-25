'use strict';

/**
 * Per-chain configuration.
 *
 * `discovery` is how the weekly run auto-finds the newest megathread (no
 * hardcoded ids needed going forward). `seedThreads` are the archive threads
 * used by `--backfill` to reconstruct the full history back to #1 — their
 * numbered windows overlap and tile the whole run. These ids were resolved
 * from the "previous megathread" links in the current threads (2026-07-25).
 */

module.exports = {
  chains: [
    {
      chain: 'AMC',
      discovery: {
        subreddit: 'AMCsAList',
        query: 'Screen Unseen Megathread',
        titleRe: /scre(?:en|am) unseen megathread/i,
        author: 'AKnightOfTheNew',
      },
      // window covered -> archive thread id
      seedThreads: [
        '1e4nbh7', // 1-22   (Jul 22 2024)
        '1hatoyh', // 21-32  (Dec 16 2024)
        '1ldli7x', // 32-45  (Jun 23 2025)
        '1ocy90r', // 45-60  (Oct 27 2025)
        '1sz6wre', // 61-80  (May 3&4 2026)
        '1v438bg', // 81-89  (Jul 27 2026)
      ],
    },
    {
      chain: 'Regal',
      discovery: {
        subreddit: 'RegalUnlimited',
        query: 'Mystery Movie Megathread',
        titleRe: /(?:monday mystery movie|mystery movie monday) megathread/i,
        author: 'AKnightOfTheNew',
      },
      seedThreads: [
        '1cy5f7u', // 1-37   (Jun 17 2024)
        '1hg54fv', // 36-46  (Jan 6 2025)
        '1laxxeh', // 46-55  (Jun 23 2025)
        '1pe2otx', // 55-69  (Dec 8 2025)
        '1sypso4', // 70-87  (May 3&4 2026)
        '1uuy1c0', // 88-93  (Jul 27 2026)
      ],
    },
  ],
};
