import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { NewsItem } from '../types';
import { fetchGoogleNews } from './fetchGoogleNews';

// NewsData.io — free tier allows COMMERCIAL use (unlike GNews free), 200 credits/day,
// 10 articles/credit, ~12h delay (fine for our 48h story window). Works from server IPs
// where Google News RSS is often blocked.
const API_URL = 'https://newsdata.io/api/1/latest';
const CACHE_PATH = path.join(process.cwd(), 'data', 'newsdata-cache.json');
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h — conserve daily credits

// A couple of targeted queries (each = 1 credit). Keep it small.
const QUERIES = [
  'Indian cinema OR filmmaker OR "film industry"',
  'OTT India OR Netflix India OR "Prime Video" OR "film festival" OR "indie film"',
];

interface NewsDataResult {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  source_id?: string;
  source_name?: string;
}
interface NewsDataResponse { status?: string; results?: NewsDataResult[] }
interface Cache { fetchedAt: string; items: NewsItem[] }

function loadCache(): NewsItem[] | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as Cache;
    if (Date.now() - new Date(raw.fetchedAt).getTime() < CACHE_TTL_MS) return raw.items;
  } catch { /* no cache */ }
  return null;
}
function saveCache(items: NewsItem[]): void {
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), items }, null, 2), 'utf8'); }
  catch (err) { console.warn('⚠️  Could not save NewsData cache:', (err as Error).message); }
}

export async function fetchNewsData(): Promise<NewsItem[]> {
  const apikey = process.env.NEWSDATA_API_KEY;
  if (!apikey) {
    console.log('ℹ️  NEWSDATA_API_KEY not set — skipping NewsData.io fetch.');
    return [];
  }

  const cached = loadCache();
  if (cached) {
    console.log(`   NewsData: using cached results (${cached.length} items)`);
    return cached;
  }

  const all: NewsItem[] = [];
  const seen = new Set<string>();

  for (const q of QUERIES) {
    try {
      const res = await axios.get<NewsDataResponse>(API_URL, {
        params: { apikey, q, country: 'in', language: 'en', category: 'entertainment' },
        timeout: 10000,
      });
      for (const r of res.data.results ?? []) {
        const title = (r.title ?? '').trim();
        if (!title) continue;
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({
          title,
          description: (r.description ?? '').replace(/<[^>]+>/g, '').trim(),
          source: r.source_name || r.source_id || '',
          pubDate: r.pubDate ?? '',
          link: r.link ?? '',
        });
      }
      await new Promise(res2 => setTimeout(res2, 1100)); // free tier: max 1 req/sec
    } catch (err) {
      const e = err as { response?: { status?: number }; message?: string };
      console.warn(`⚠️  NewsData.io failed for "${q}": ${e.response?.status ?? ''} ${e.message ?? ''}`);
    }
  }

  if (all.length > 0) saveCache(all);
  return all;
}

// Combined news source: NewsData.io (primary, server-friendly) + Google News RSS
// (bonus when reachable), deduped by title. Use this everywhere instead of a single source.
export async function fetchNews(): Promise<NewsItem[]> {
  const [newsData, google] = await Promise.all([
    fetchNewsData(),
    fetchGoogleNews().catch(() => [] as NewsItem[]),
  ]);
  const seen = new Set<string>();
  const merged: NewsItem[] = [];
  for (const item of [...newsData, ...google]) {
    const key = item.title.toLowerCase().trim();
    if (key && !seen.has(key)) { seen.add(key); merged.push(item); }
  }
  console.log(`   News combined: ${newsData.length} NewsData + ${google.length} Google = ${merged.length} unique`);
  return merged;
}
