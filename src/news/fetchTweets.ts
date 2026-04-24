import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
dotenv.config();

import sources from './twitterSources.json';

export interface FetchedTweet {
  id: string;
  text: string;
  authorUsername: string;
  authorName: string;
  createdAt: string;
  url: string;
}

const allAccounts = [
  ...sources.filmmakers,
  ...sources.projects,
  ...sources.industry,
  ...sources.press,
];

// Topics ARIA should ignore — personal drama unrelated to craft/industry
const IGNORE_PATTERNS = [
  /\bcontroversy\b/i,
  /\bfight\b/i,
  /\battack(ed|s)?\b/i,
  /\btroll(s|ed|ing)?\b/i,
  /\bhate\b/i,
  /\bslam(med|s)?\b/i,
  /\bblast(ed|s)?\b/i,
  /\barrest(ed|s)?\b/i,
  /\blegal\s+notice\b/i,
  /\bfir\b/i,
  /\bpolice\b/i,
  /\bpolitics\b/i,
];

function isTweetRelevant(text: string): boolean {
  return !IGNORE_PATTERNS.some(pattern => pattern.test(text));
}

export async function fetchRecentTweets(): Promise<FetchedTweet[]> {
  // Twitter v2 search requires Basic plan ($100/month). Gate on same flag as posting.
  if (process.env.TWITTER_ENABLED !== 'true') {
    console.log('ℹ️  Twitter API not enabled (TWITTER_ENABLED=false) — skipping tweet fetch.');
    return [];
  }

  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
  });

  // Build a single OR query for all accounts — one API call
  const fromQuery = allAccounts.map(handle => `from:${handle}`).join(' OR ');
  const query = `(${fromQuery}) -is:retweet -is:reply lang:en`;

  try {
    const result = await client.v2.search(query, {
      max_results: 20,
      'tweet.fields': ['created_at', 'author_id', 'text'],
      'user.fields': ['username', 'name'],
      expansions: ['author_id'],
    });

    const rawTweets = result.tweets ?? [];
    const users = result.includes?.users ?? [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const tweets: FetchedTweet[] = [];

    for (const tweet of rawTweets) {
      if (!isTweetRelevant(tweet.text)) continue;

      const author = userMap.get(tweet.author_id ?? '');
      if (!author) continue;

      tweets.push({
        id: tweet.id,
        text: tweet.text,
        authorUsername: author.username,
        authorName: author.name,
        createdAt: tweet.created_at ?? new Date().toISOString(),
        url: `https://twitter.com/${author.username}/status/${tweet.id}`,
      });
    }

    return tweets;
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (error?.code === 429) {
      console.warn('⚠️  Twitter rate limit hit — skipping Type 2 today');
    } else {
      console.error('❌ fetchTweets error:', error?.message ?? err);
    }
    return [];
  }
}
