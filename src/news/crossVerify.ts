import { stringSimilarity } from 'string-similarity-js';
import { YouTubeVideo, NewsItem, VerifiedStory } from '../types';

const WINDOW_MS = 48 * 60 * 60 * 1000;

// Stop words that appear capitalised at sentence start but aren't proper nouns
const STOP_WORDS = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'To', 'For', 'Of', 'And', 'Or', 'But',
  'Is', 'Are', 'Was', 'Were', 'Has', 'Have', 'Had', 'With', 'From', 'By',
  'This', 'That', 'These', 'Those', 'How', 'Why', 'What', 'When', 'Where',
  'New', 'Big', 'First', 'Latest', 'Best', 'Top', 'All', 'Now', 'Here',
]);

function extractProperNouns(title: string): string[] {
  // Extract capitalised words/sequences that aren't stop words
  const tokens = title
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);

  const nouns: string[] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (/^[A-Z]/.test(token) && !STOP_WORDS.has(token)) {
      current.push(token);
    } else {
      if (current.length > 0) {
        nouns.push(current.join(' '));
        current = [];
      }
    }
  }
  if (current.length > 0) nouns.push(current.join(' '));

  return nouns;
}

function properNounOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bLower = b.map(s => s.toLowerCase());
  return a.filter(n => bLower.some(m => m.includes(n.toLowerCase()) || n.toLowerCase().includes(m))).length;
}

function isWithin48Hours(dateStr: string): boolean {
  if (!dateStr) return false;
  try {
    return Date.now() - new Date(dateStr).getTime() <= WINDOW_MS;
  } catch {
    return false;
  }
}

export function crossVerify(videos: YouTubeVideo[], news: NewsItem[]): VerifiedStory[] {
  const recentNews = news.filter(n => isWithin48Hours(n.pubDate));
  const recentVideos = videos.filter(v => isWithin48Hours(v.publishedAt));

  const stories: VerifiedStory[] = [];

  for (const video of recentVideos) {
    const videoNouns = extractProperNouns(video.title);
    const vTitle = video.title.toLowerCase();

    const matchingNews: NewsItem[] = [];
    let topOverlap = 0;
    let topFuzzy = 0;

    for (const item of recentNews) {
      const newsNouns = extractProperNouns(item.title);
      const nTitle = item.title.toLowerCase();

      const overlap = properNounOverlap(videoNouns, newsNouns);
      const fuzzy = stringSimilarity(vTitle, nTitle);

      if (overlap >= 1 || fuzzy >= 0.4) {
        matchingNews.push(item);
        if (overlap > topOverlap) topOverlap = overlap;
        if (fuzzy > topFuzzy) topFuzzy = fuzzy;
      }
    }

    if (matchingNews.length > 0) {
      stories.push({
        youtubeVideo: video,
        matchingNews,
        matchScore: topOverlap + topFuzzy,
      });
    }
  }

  return stories.sort((a, b) => b.matchScore - a.matchScore);
}
