# mystery-movies

Automatically extracts the **identified** films from the two Reddit megathreads that track theater "mystery screenings", and keeps a versioned data file up to date every week.

- **AMC Screen Unseen** (r/AMCsAList)
- **Regal Monday Mystery Movie** (r/RegalUnlimited)

Films that have not been revealed yet (placeholders still marked "Rated R / Revealed As: TBD") are skipped. When a new film is revealed, it is added to `data/mystery-movies.json` and a line is appended to `data/changelog.txt`.

## How it works

1. Reddit exposes every thread as JSON. This project reads the megathread post body and parses the numbered list of screenings.
2. It talks to Reddit through the **official OAuth API** (app-only token). That matters because Reddit blocks anonymous requests from datacenter IPs (like CI runners), but an authenticated token works from anywhere. That is what lets this run in GitHub Actions with no machine of your own left on.
3. A GitHub Actions workflow runs after the Monday-night screenings, commits any changes back to the repo, and stops. Off weeks with no new movie change nothing.

## One-time setup

### 1. Create a Reddit "script" app (about 2 minutes)

1. Go to https://www.reddit.com/prefs/apps while logged in.
2. Click **create another app...** at the bottom.
3. Fill in:
   - **name**: `mystery-movies` (anything)
   - Select **script**
   - **redirect uri**: `http://localhost:8080` (required but unused)
4. Click **create app**.
5. Note two values:
   - **client id**: the short string just under the app name (under "personal use script")
   - **secret**: the `secret` field

### 2. Add the credentials as GitHub secrets

In your repo: **Settings -> Secrets and variables -> Actions -> New repository secret**. Add three:

| Secret name | Value |
|---|---|
| `REDDIT_CLIENT_ID` | the client id from step 1 |
| `REDDIT_CLIENT_SECRET` | the secret from step 1 |
| `REDDIT_USER_AGENT` | `mystery-movies/1.0 (by /u/YOUR_REDDIT_USERNAME)` |

Reddit asks that the user agent identify you, so put your actual Reddit username in it.

### 3. Backfill the full history (once)

Fetch every archived megathread back to #1 and build the complete data file:

- **In GitHub**: go to **Actions -> Update mystery movies -> Run workflow**, choose **backfill**, and run it.
- **Or locally** (guaranteed to work from a home IP):

  ```bash
  export REDDIT_CLIENT_ID=...        # or put these in a .env and source it
  export REDDIT_CLIENT_SECRET=...
  export REDDIT_USER_AGENT='mystery-movies/1.0 (by /u/yourname)'
  npm run backfill
  git add data && git commit -m "backfill history" && git push
  ```

After that, the weekly schedule keeps it current on its own.

## Usage

| Command | What it does |
|---|---|
| `npm run update` | Weekly run. Finds the newest thread in each sub, merges new reveals into the data file, appends to the changelog. |
| `npm run backfill` | Rebuilds the entire history from the archive threads listed in `src/config.js`. |
| `npm run dry-run` | Prints what would change without writing files. |
| `npm test` | Runs the parser + extractor tests (no network needed). |
| `node src/extract.js --file post.json --chain AMC` | Parse a saved Reddit thread `.json` offline. Handy for debugging a format change. |

The GitHub Actions workflow (`.github/workflows/update-mystery-movies.yml`) runs `npm run update` automatically on Tuesday and Wednesday early UTC (Monday night / Tuesday US time), which gives the mods time to reveal each film. You can also trigger it manually from the Actions tab.

## Data format

`data/mystery-movies.json`:

```json
{
  "generatedAt": "2026-07-28T06:00:11.000Z",
  "sources": [
    { "chain": "AMC", "threadId": "1v438bg", "title": "AMC Screen Unseen Megathread - July 27 2026" }
  ],
  "screenings": [
    {
      "chain": "AMC",
      "number": 87,
      "title": "Motor City",
      "rating": "R",
      "distributor": "IFC",
      "date": "2026-07-20",
      "reportedRuntime": "1h46m",
      "actualRuntime": "1h43m",
      "url": "https://www.amctheatres.com/movies/amc-screen-unseen-july-20-84361"
    }
  ]
}
```

- `number` is the chain's own sequential count of mystery screenings.
- `date` is ISO `YYYY-MM-DD`.
- `reportedRuntime` is the padded runtime the theater listed; `actualRuntime` is the real film's runtime (null until known).
- `url` is present when the thread linked one (AMC entries usually do).

`data/changelog.txt` gets one line per new reveal, for example:

```
[2026-07-28T06:00:11.000Z] AMC #88 revealed: Kneecap (R, Sony) — 2026-07-27
```

## Tracking new threads / format changes

- New threads are found automatically each week by searching each subreddit for the megathread title. No ids to update.
- The archive thread ids used by `--backfill` live in `src/config.js`. They only matter for rebuilding history.
- The mod's formatting has drifted a few times over the years. The parser already handles the known variants (see `test/parse.test.js`). If a future thread uses a new format and something looks wrong, run `node src/extract.js --file <saved.json> --chain <AMC|Regal>` to see what the parser produced, then adjust `src/parse.js`.

## Notes

- No dependencies. Node 18+ (uses the built-in `fetch`).
- The data is best-effort from community-maintained threads. Very old entries occasionally have typos in the source (for example a missing "m" on a runtime); those pass through as written.
