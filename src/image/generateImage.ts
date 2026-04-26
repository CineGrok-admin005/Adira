import { readFileSync } from 'fs';
import axios from 'axios';
import path from 'path';
import FormData from 'form-data';

const ADIRA_IMAGE_PATH = path.resolve(process.cwd(), 'assets', 'adira-avatar.png');
const SPACE_URL = 'https://yanze-pulid-flux.hf.space';

async function uploadFaceImage(token: string): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('files', readFileSync(ADIRA_IMAGE_PATH), { filename: 'adira-avatar.png', contentType: 'image/png' });

    const res = await axios.post(`${SPACE_URL}/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
      timeout: 30000,
    });
    return res.data?.[0] ?? null;
  } catch (err) {
    console.error('❌ Face upload failed:', (err as Error).message);
    return null;
  }
}

export async function generateAdiraImage(prompt: string, style: string): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_KEY;
  if (!token) return null;

  try {
    console.log('🖼️  Generating ADIRA image via PuLID-FLUX...');

    const styleMap: Record<string, string> = {
      Cinematic: '2D animated illustration, graphic novel art style, flat cel-shading, bold outlines, Indian cinema poster aesthetic, NOT photorealistic',
      Moody:     '2D animated illustration, graphic novel art style, moody dramatic shadows, cel-shaded, bold outlines, NOT photorealistic',
      Surreal:   '2D animated illustration, surreal dreamlike graphic novel style, cel-shaded, bold outlines, NOT photorealistic',
    };
    const fullPrompt = `ADIRA, Indian woman reporter, ${prompt}, ${styleMap[style] ?? styleMap.Cinematic}, press lanyard, high detail illustration`;
    const negativePrompt = '(photorealistic:1.5), photograph, 3D render, realistic skin texture, realistic lighting, RAW photo, DSLR, (lowres, low quality, worst quality:1.2), text, watermark, deformed, ugly, blurry';

    // Step 1: Upload face reference image
    const facePath = await uploadFaceImage(token);
    if (!facePath) {
      console.warn('⚠️  Could not upload face image — skipping image generation');
      return null;
    }

    // Step 2: Submit generation job
    const submitRes = await axios.post(
      `${SPACE_URL}/call/generate_image`,
      {
        data: [
          fullPrompt,       // prompt
          { path: facePath }, // id_image (uploaded file reference)
          1,                // timestep_to_start_id
          4,                // guidance
          '-1',             // seed
          1,                // true_cfg_scale
          1024,             // width
          1024,             // height
          28,               // num_steps
          1,                // id_weight
          negativePrompt,   // negative_prompt
          1,                // timestep_to_start_cfg
          128,              // max_sequence_length
        ],
      },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );

    const eventId = submitRes.data?.event_id;
    if (!eventId) {
      console.warn('⚠️  No event_id returned from PuLID-FLUX');
      return null;
    }

    // Step 3: Poll for result (SSE — read until 'complete' event)
    console.log(`   Polling for result (event: ${eventId})...`);
    const resultRes = await axios.get(`${SPACE_URL}/call/generate_image/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'text',
      timeout: 120000,
    });

    // Parse SSE: find last 'data:' line with JSON
    const lines = (resultRes.data as string).split('\n');
    let imageUrl: string | null = null;
    for (const line of lines) {
      if (line.startsWith('data:')) {
        try {
          const parsed = JSON.parse(line.slice(5).trim());
          const url = parsed?.[0]?.url;
          if (url) imageUrl = url;
        } catch { /* not all lines are JSON */ }
      }
    }

    if (!imageUrl) {
      console.warn('⚠️  PuLID-FLUX returned no image URL in result');
      return null;
    }

    console.log('✅ Image generated. Downloading...');
    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(imgRes.data);

  } catch (error) {
    console.error('❌ PuLID-FLUX image generation failed:', (error as Error).message);
    return null;
  }
}
