'use strict';

/**
 * Minimal Reddit OAuth client (app-only / "client_credentials" grant).
 *
 * Why OAuth instead of the anonymous `.json` endpoint: Reddit blocks
 * unauthenticated requests from datacenter IPs (CI runners, clouds) with a bot
 * interstitial. An app-only bearer token is the sanctioned path and works from
 * anywhere, so the same script runs on your laptop or in GitHub Actions.
 *
 * Credentials come from env vars (never hardcode them):
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
 *   REDDIT_USER_AGENT   e.g. "mystery-movies/1.0 (by /u/yourname)"
 */

const AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const API = 'https://oauth.reddit.com';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. See README (Reddit app setup).`);
  return v;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, opts, { tries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * (i + 1);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${(await res.text()).slice(0, 200)}`);
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr || new Error(`Failed after ${tries} tries: ${url}`);
}

async function getToken(ua) {
  const id = requireEnv('REDDIT_CLIENT_ID');
  const secret = requireEnv('REDDIT_CLIENT_SECRET');
  const res = await fetchWithRetry(AUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': ua,
    },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('No access_token in Reddit auth response: ' + JSON.stringify(json));
  return json.access_token;
}

function createClient() {
  const ua = process.env.REDDIT_USER_AGENT || 'mystery-movies/1.0 (by /u/unknown)';
  let tokenPromise = null;
  const token = () => (tokenPromise = tokenPromise || getToken(ua));

  async function api(path) {
    const t = await token();
    const res = await fetchWithRetry(API + path, {
      headers: { 'Authorization': `bearer ${t}`, 'User-Agent': ua },
    });
    return res.json();
  }

  return {
    /** Fetch one thread's post body (no comments) by its base-36 id. */
    async getPost(id) {
      const data = await api(`/by_id/t3_${id}?raw_json=1`);
      const post = data?.data?.children?.[0]?.data;
      if (!post) throw new Error(`No post found for id ${id}`);
      return { id: post.id, title: post.title, selftext: post.selftext, createdUtc: post.created_utc };
    },

    /**
     * Find the newest megathread in a subreddit that matches a title regex and
     * (optionally) an author. Returns { id, title, createdUtc } or null.
     */
    async findLatestThread({ subreddit, query, titleRe, author }) {
      const q = encodeURIComponent(query);
      const data = await api(`/r/${subreddit}/search?q=${q}&restrict_sr=1&sort=new&limit=100&raw_json=1`);
      const posts = (data?.data?.children || []).map((c) => c.data);
      const matches = posts
        .filter((p) => titleRe.test(p.title))
        .filter((p) => (author ? p.author === author : true))
        .sort((a, b) => b.created_utc - a.created_utc);
      const p = matches[0];
      return p ? { id: p.id, title: p.title, createdUtc: p.created_utc } : null;
    },
  };
}

module.exports = { createClient };
