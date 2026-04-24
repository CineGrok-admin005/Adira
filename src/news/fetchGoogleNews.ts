import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import dotenv from 'dotenv';
dotenv.config();

import { NewsItem } from '../types';

const CACHE_PATH = path.join(process.cwd(), 'data', 'news-cache.json');
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const WINDOW_MS = 48 * 60 * 60 * 1000;   // 48-hour story window

const QUERIES = [
  '"OTT India" OR "streaming India" filmmaker OR director OR "original content"',
  '"NFDC" OR "film fund" OR "indie film" India debut OR "first film"',
  '"MAMI" OR "IFFK" OR "IFFI" OR "film festival India" selection OR winner',
  '"Indian cinema" "box office" record OR benchmark OR "new high"',
  '"production house" India "new talent" OR "debut director" OR "first film"',
];

interface NewsCache {
  fetchedAt: string;
  items: NewsItem[];
}

function loadCache(): NewsCache | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as NewsCache;
    const age = Date.now() - new Date(raw.fetchedAt).getTime();
    if (age < CACHE_TTL_MS) return raw;
    return null;
  } catch {
    return null;
  }
}

function saveCache(items: NewsItem[]): void {
  try {
    const cache: NewsCache = { fetchedAt: new Date().toISOString(), items };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️  Could not save news cache:', err);
  }
}

async function fetchRSSFeed(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?hl=en&gl=IN&q=${encodeURIComponent(query)}&ceid=IN:en`;

  const res = await axios.get<string>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CineGrok-Agent/1.0)' },
    timeout: 10000,
    responseType: 'text',
  });

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '_',
    textNodeName: '#text',
  });

  const parsed = parser.parse(res.data) as {
    rss?: { channel?: { item?: RSSItem | RSSItem[] } };
  };

  const rawItems = parsed?.rss?.channel?.item;
  const items: RSSItem[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const cutoff = Date.now() - WINDOW_MS;
  const results: NewsItem[] = [];

  for (const item of items) {
    const pubDate = String(item.pubDate ?? '');
    if (pubDate && new Date(pubDate).getTime() < cutoff) continue;

    const source =
      typeof item.source === 'object' && item.source !== null
        ? String((item.source as Record<string, unknown>)['#text'] ?? '')
        : String(item.source ?? '');

    results.push({
      title: String(item.title ?? '').replace(/ - [^-]+$/, '').trim(), // strip " - Source Name" suffix Google adds
      description: String(item.description ?? '').replace(/<[^>]+>/g, '').trim(),
      source,
      pubDate,
      link: String(item.link ?? ''),
    });
  }

  return results;
}

interface RSSItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  description?: unknown;
  source?: unknown;
}

export async function fetchGoogleNews(): Promise<NewsItem[]> {
  const cached = loadCache();
  if (cached) {
    console.log(`   News: using cached results (${cached.items.length} items)`);
    return cached.items;
  }

  const allItems: NewsItem[] = [];
  const seen = new Set<string>();

  for (const query of QUERIES) {
    try {
      const items = await fetchRSSFeed(query);
      for (const item of items) {
        const key = item.title.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          allItems.push(item);
        }
      }
      // Small delay between requests — avoids Google rate-limiting
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.warn(`⚠️  Google News RSS failed for query "${query}":`, (err as Error).message);
    }
  }

  saveCache(allItems);
  return allItems;
}
