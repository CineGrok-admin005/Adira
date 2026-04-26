import axios from 'axios';
import type { EmotionState } from '../types';

const ADIRA_AVATAR_URL = 'https://raw.githubusercontent.com/CineGrok-admin005/Adira/main/assets/adira-avatar.png';
const SPACE_URL = 'https://yanze-pulid-flux.hf.space';

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

  const expression = expressionMap[emotion] ?? expressionMap.thoughtful;
  const styleStr   = styleMap[style] ?? styleMap.Cinematic;

  return {
    positive: `ADIRA, Indian woman reporter, ${scene}, ${expression}, ${styleStr}, press lanyard reading ADIRA CineGrok, expressive face, high detail illustration`,
    negative: '(photorealistic:1.5), photograph, 3D render, realistic skin, (dead eyes, lifeless expression, blank stare, dull expression:1.4), emotionless face, plastic skin, text, watermark, deformed, ugly, blurry',
  };
}

export async function generateAdiraImage(prompt: string, style: string, emotion: EmotionState = 'thoughtful'): Promise<Buffer | null> {
  const token = process.env.HUGGINGFACE_API_KEY;
  if (!token) return null;

  try {
    console.log(`🖼️  Generating ADIRA image — emotion: ${emotion}...`);

    const { positive, negative } = buildPuLIDPrompt(prompt, style, emotion);

    const submitRes = await axios.post(
      `${SPACE_URL}/call/generate_image`,
      {
        data: [
          positive,
          { url: ADIRA_AVATAR_URL },
          1,        // timestep_to_start_id
          4,        // guidance
          '-1',     // seed
          1,        // true_cfg_scale
          1024,     // width
          1024,     // height
          28,       // num_steps
          1,        // id_weight
          negative,
          1,        // timestep_to_start_cfg
          128,      // max_sequence_length
        ],
      },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );

    const eventId = submitRes.data?.event_id;
    if (!eventId) {
      console.warn('⚠️  No event_id from PuLID-FLUX');
      return null;
    }

    console.log(`   Polling result (event: ${eventId})...`);
    const resultRes = await axios.get(`${SPACE_URL}/call/generate_image/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'text',
      timeout: 120000,
    });

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
      console.warn('⚠️  PuLID-FLUX returned no image URL');
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
