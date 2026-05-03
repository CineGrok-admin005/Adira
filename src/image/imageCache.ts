import fs from 'fs';
import path from 'path';
import type { EmotionState } from '../types';

const CACHE_DIR = path.join(process.cwd(), 'data');
const TTL_MS    = 90 * 60 * 1000; // 90 minutes

export interface CachedImageData {
  generatedAt: string;
  imageBase64: string;
  prompt: string;
  style: string;
  emotion: EmotionState;
  speechBubble?: string;
}

function cachePath(type: 'type1' | 'type2'): string {
  return path.join(CACHE_DIR, `pending-image-${type}.json`);
}

export function saveImageCache(type: 'type1' | 'type2', data: CachedImageData): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath(type), JSON.stringify(data), 'utf8');
    console.log(`💾 Image cached for ${type}`);
  } catch (err) {
    console.warn('⚠️  Could not save image cache:', (err as Error).message);
  }
}

export function loadImageCache(type: 'type1' | 'type2'): CachedImageData | null {
  try {
    const raw  = fs.readFileSync(cachePath(type), 'utf8');
    const data = JSON.parse(raw) as CachedImageData;
    const age  = Date.now() - new Date(data.generatedAt).getTime();
    if (age > TTL_MS) {
      console.log(`⏰ Image cache for ${type} expired (${Math.round(age / 60000)} min old)`);
      return null;
    }
    console.log(`✅ Using cached image for ${type} (${Math.round(age / 60000)} min old)`);
    return data;
  } catch {
    return null;
  }
}

export function clearImageCache(type: 'type1' | 'type2'): void {
  try { fs.unlinkSync(cachePath(type)); } catch { /* already gone */ }
}

export function bufferToBase64(buf: Buffer): string {
  return buf.toString('base64');
}

export function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, 'base64');
}
