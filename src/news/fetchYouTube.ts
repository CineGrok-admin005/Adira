import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import sources from './youtubeSources.json';
import { YouTubeVideo } from '../types';

// Quota cost per call:
//   channels.list    → 1 unit  (cached after first run → 0/day)
//   playlistItems.list → 1 unit per channel
// Total daily cost: ~6 units (well within 10,000 free quota)

const YT_API = 'https://www.googleapis.com/youtube/v3';
const CACHE_PATH = path.join(process.cwd(), 'data', 'youtube-channel-cache.json');
const WINDOW_MS = 48 * 60 * 60 * 1000;

interface ChannelCacheEntry {
  channelId: string;
  uploadsPlaylistId: string;
}

interface YTChannelResponse {
  items?: Array<{
    id: string;
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface YTPlaylistResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      channelId?: string;
      publishedAt?: string;
      resourceId?: { videoId?: string };
    };
  }>;
}

function loadChannelCache(): Record<string, ChannelCacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveChannelCache(cache: Record<string, ChannelCacheEntry>): void {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️  Could not save YouTube channel cache:', err);
  }
}

export async function fetchYouTubeVideos(): Promise<YouTubeVideo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    console.log('ℹ️  YOUTUBE_API_KEY not set — skipping YouTube fetch.');
    return [];
  }

  const cache = loadChannelCache();
  let cacheUpdated = false;

  // Resolve handles not yet in cache — 1 unit each, only runs once per handle ever
  for (const ch of sources.channels) {
    if (cache[ch.handle]) continue;
    try {
      const res = await axios.get<YTChannelResponse>(`${YT_API}/channels`, {
        params: { part: 'id,contentDetails', forHandle: ch.handle, key },
        timeout: 10000,
      });
      const item = res.data.items?.[0];
      const channelId = item?.id;
      const uploadsPlaylistId = item?.contentDetails?.relatedPlaylists?.uploads;
      if (channelId && uploadsPlaylistId) {
        cache[ch.handle] = { channelId, uploadsPlaylistId };
        cacheUpdated = true;
      } else {
        console.warn(`⚠️  Could not resolve YouTube handle: @${ch.handle}`);
      }
    } catch (err) {
      console.warn(`⚠️  channels lookup failed for @${ch.handle}:`, (err as Error).message);
    }
  }

  if (cacheUpdated) saveChannelCache(cache);

  const cutoff = Date.now() - WINDOW_MS;
  const videos: YouTubeVideo[] = [];

  // Fetch recent uploads — 1 unit per channel (not 100 like search.list)
  for (const ch of sources.channels) {
    const entry = cache[ch.handle];
    if (!entry) continue;

    try {
      const res = await axios.get<YTPlaylistResponse>(`${YT_API}/playlistItems`, {
        params: {
          part: 'snippet',
          playlistId: entry.uploadsPlaylistId,
          maxResults: 5,
          key,
        },
        timeout: 10000,
      });

      for (const item of res.data.items ?? []) {
        const snippet = item.snippet;
        const videoId = snippet?.resourceId?.videoId;
        if (!snippet || !videoId) continue;

        const pubAt = snippet.publishedAt ?? '';
        if (pubAt && new Date(pubAt).getTime() < cutoff) continue;

        videos.push({
          id: videoId,
          title: snippet.title ?? '',
          channelId: entry.channelId,
          channelTitle: snippet.channelTitle ?? ch.handle,
          publishedAt: pubAt,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          description: (snippet.description ?? '').slice(0, 500),
        });
      }
    } catch (err) {
      console.warn(`⚠️  playlistItems failed for @${ch.handle}:`, (err as Error).message);
    }
  }

  return videos;
}
