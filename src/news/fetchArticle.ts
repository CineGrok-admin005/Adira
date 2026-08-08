import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

// Free, server-side article-body extraction: GET the page and pull the main text so ADIRA can
// ground posts on real facts (names, numbers, quotes) instead of one-line blurbs.
// Fully optional + graceful — any failure returns null and the caller falls back to the blurb.

const CACHE_PATH = path.join(process.cwd(), 'data', 'article-cache.json');
const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // matches the 48h story window — never re-fetch
const MAX_CHARS = 1200;                    // hard cap — keeps Groq input tokens bounded
const MIN_CHARS = 120;                     // below this, treat extraction as failed

interface CacheEntry { fetchedAt: string; text: string } // text === '' means "tried, nothing usable"

function loadCache(): Record<string, CacheEntry> {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as Record<string, CacheEntry>;
    const fresh: Record<string, CacheEntry> = {};
    for (const [url, entry] of Object.entries(raw)) {
      if (Date.now() - new Date(entry.fetchedAt).getTime() < CACHE_TTL_MS) fresh[url] = entry;
    }
    return fresh;
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CacheEntry>): void {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️  Could not save article cache:', (err as Error).message);
  }
}

function extractMainText(html: string): string {
  const $ = cheerio.load(html);

  // Drop obvious non-content noise before reading paragraphs.
  $('script, style, nav, footer, header, aside, form, noscript, figure, figcaption').remove();

  // Prefer paragraphs inside <article>; fall back to all reasonably long <p> blocks
  // (the length filter drops nav links, captions, and boilerplate).
  const paraSelector = $('article').length ? 'article p' : 'p';
  const paras: string[] = [];
  $(paraSelector).each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length > 40) paras.push(t);
  });

  return paras.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

export async function fetchArticleText(url: string): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  const cache = loadCache();
  if (url in cache) {
    const cached = cache[url].text;
    return cached.length >= MIN_CHARS ? cached : null;
  }

  let text = '';
  try {
    const res = await axios.get<string>(url, {
      timeout: 8000,
      responseType: 'text',
      maxContentLength: 4 * 1024 * 1024, // 4MB guard against huge pages
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    text = extractMainText(res.data);
  } catch (err) {
    console.warn(`⚠️  Article fetch failed (${url}): ${(err as Error).message}`);
    text = '';
  }

  const usable = text.length >= MIN_CHARS;
  cache[url] = { fetchedAt: new Date().toISOString(), text: usable ? text : '' };
  saveCache(cache);

  return usable ? text : null;
}
