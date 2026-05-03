import axios from 'axios';
import { readFileSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { EmotionState } from '../types';

const AVATAR_PATH = path.resolve(process.cwd(), 'assets', 'adira-avatar.png');
const SPACE_URL   = 'https://yanze-pulid-flux.hf.space/gradio_api';

function buildPuLIDPrompt(scene: string, style: string, emotion: EmotionState): { positive: string; negative: string } {
  const expressionMap: Record<EmotionState, string> = {
    excited:    '(eyes sparkling with excitement:1.4), (genuine broad smile showing enthusiasm:1.4), (raised eyebrows:1.3), (forward-leaning dynamic posture:1.3), (open gesturing hands:1.2)',
    thoughtful: '(soft focused eyes looking slightly to side:1.3), (hand raised to chin in contemplation:1.4), (slight furrow of concentration:1.2), (calm attentive posture:1.2)',
    reporting:  '(engaged curious expression with slight smile:1.3), (direct interested gaze:1.3), (confident upright reporter stance:1.3), (notepad or mic in hand:1.2)',
    serious:    '(intense direct gaze into camera:1.4), (pressed determined lips:1.3), (strong upright posture:1.3), (furrowed brow of gravitas:1.2)',
    warm:       '(genuine warm smile with crinkled eyes:1.3), (relaxed open posture:1.2), (soft approachable expression:1.3)',
  };

  const styleMap: Record<string, string> = {
    Cinematic: '2D animated illustration, graphic novel art style, flat cel-shading, bold outlines, Indian cinema poster aesthetic',
    Moody:     '2D animated illustration, moody dramatic graphic novel style, cel-shaded, high contrast bold outlines',
    Surreal:   '2D animated illustration, surreal graphic novel style, cel-shaded, bold outlines, dreamlike',
  };

  return {
    positive: `ADIRA, Indian woman reporter, ${scene}, ${expressionMap[emotion] ?? expressionMap.thoughtful}, ${styleMap[style] ?? styleMap.Cinematic}, press lanyard reading ADIRA CineGrok, expressive face, high detail illustration`,
    negative: '(photorealistic:1.5), photograph, 3D render, realistic skin, (dead eyes, lifeless expression, blank stare, dull expression:1.4), emotionless face, plastic skin, text, watermark, deformed, ugly, blurry',
  };
}

async function addSpeechBubble(imageBuffer: Buffer, text: string): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  // Cap text length for display
  const display = text.length > 80 ? text.slice(0, 77) + '...' : text;
  const fontSize = Math.max(22, Math.round(w / 36));
  const barH     = Math.round(fontSize * 3.2);
  const padding  = Math.round(fontSize * 0.9);

  // SVG: dark gradient bar at bottom with white text
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${h - barH}" width="${w}" height="${barH}" fill="url(#bar)"/>
    <text
      x="${padding}"
      y="${h - Math.round(barH * 0.28)}"
      font-family="Georgia, serif"
      font-size="${fontSize}"
      font-style="italic"
      fill="white"
      opacity="0.95"
    >${display.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</text>
  </svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png()
    .toBuffer();
}

async function attemptGeneration(token: string, positive: string, negative: string): Promise<Buffer | null> {
  // Resize avatar to 512px before base64 — original is 6MB which times out on Railway
  const resized  = await sharp(readFileSync(AVATAR_PATH)).resize(512, 512, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
  const avatarB64 = resized.toString('base64');
  const imageData = { url: `data:image/png;base64,${avatarB64}`, orig_name: 'adira-avatar.png', mime_type: 'image/png', is_stream: false, meta: {} };

  const submitRes = await axios.post(
    `${SPACE_URL}/call/generate_image`,
    { data: [positive, imageData, 1, 4, '-1', 1, 1024, 1024, 28, 1, negative, 1, 128] },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  const eventId = submitRes.data?.event_id;
  if (!eventId) return null;

  const resultRes = await axios.get(`${SPACE_URL}/call/generate_image/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'text',
    timeout: 120000,
  });

  const lines = (resultRes.data as string).split('\n');
  let imageUrl: string | null = null;
  let nextIsComplete = false;
  for (const line of lines) {
    if (line.trim() === 'event: complete') { nextIsComplete = true; continue; }
    if (nextIsComplete && line.startsWith('data:')) {
      try {
        const parsed = JSON.parse(line.slice(5).trim());
        const url = parsed?.[0]?.url;
        if (url) { imageUrl = url; break; }
      } catch { /* skip */ }
      nextIsComplete = false;
    }
  }

  if (!imageUrl) return null;

  const imgRes = await axios.get(imageUrl, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  return Buffer.from(imgRes.data as ArrayBuffer);
}

export async function generateAdiraImage(prompt: string, style: string, emotion: EmotionState = 'thoughtful', speechBubble?: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_KEY;
  if (!token) return null;

  const { positive, negative } = buildPuLIDPrompt(prompt, style, emotion);
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`🖼️  Generating ADIRA image — emotion: ${emotion} (attempt ${attempt}/${MAX_ATTEMPTS})...`);
      const imageRaw = await attemptGeneration(token, positive, negative);
      if (imageRaw) {
        console.log('✅ Image generated.');
        return speechBubble ? addSpeechBubble(imageRaw, speechBubble) : imageRaw;
      }
      console.warn(`⚠️  Attempt ${attempt} returned no image.`);
    } catch (err) {
      console.warn(`⚠️  Attempt ${attempt} failed:`, (err as Error).message);
    }
    if (attempt < MAX_ATTEMPTS) {
      console.log(`   Retrying in 8 seconds...`);
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.error('❌ PuLID-FLUX image generation failed after 3 attempts.');
  return null;
}
