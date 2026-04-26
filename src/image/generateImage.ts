import { Client } from '@gradio/client';
import { readFileSync } from 'fs';
import path from 'path';

const ADIRA_IMAGE_PATH = path.resolve(process.cwd(), 'assets', 'adira-avatar.png');

export async function generateAdiraImage(prompt: string, style: string): Promise<Buffer | null> {
  try {
    console.log('🖼️  Generating ADIRA image via PuLID-FLUX...');

    const app = await Client.connect('yanze/PuLID-FLUX', {
      token: process.env.HUGGINGFACE_API_KEY as `hf_${string}`,
    });

    const faceBuffer = readFileSync(ADIRA_IMAGE_PATH);
    const faceBlob = new Blob([faceBuffer], { type: 'image/png' });

    const styleMap: Record<string, string> = {
      Cinematic: '2D animated illustration, graphic novel art style, flat cel-shading, bold outlines, Indian cinema poster aesthetic, NOT photorealistic',
      Moody:     '2D animated illustration, graphic novel art style, moody dramatic shadows, cel-shaded, bold outlines, NOT photorealistic',
      Surreal:   '2D animated illustration, surreal dreamlike graphic novel style, cel-shaded, bold outlines, NOT photorealistic',
    };
    const fullPrompt = `ADIRA, Indian woman reporter, ${prompt}, ${styleMap[style] ?? styleMap.Cinematic}, press lanyard, high detail illustration`;

    // Endpoint: /generate_image
    // Params: prompt, id_image, timestep_to_start_id, guidance, seed(str),
    //         true_cfg_scale, width, height, num_steps, id_weight,
    //         negative_prompt, timestep_to_start_cfg, max_sequence_length
    const result = await (app.predict('/generate_image', [
      fullPrompt,   // prompt
      faceBlob,     // id_image
      1,            // timestep_to_start_id (0-1 for illustrated style)
      4,            // guidance
      '-1',         // seed as string
      1,            // true_cfg_scale
      1024,         // width
      1024,         // height
      28,           // num_steps
      1,            // id_weight
      '(photorealistic:1.5), photograph, 3D render, realistic skin texture, realistic lighting, RAW photo, DSLR, (lowres, low quality, worst quality:1.2), text, watermark, deformed, ugly, blurry',
      1,            // timestep_to_start_cfg
      128,          // max_sequence_length
    ]) as Promise<unknown>).catch((err: Error) => {
      console.error('❌ PuLID-FLUX predict failed:', err.message);
      return null;
    });

    if (!result) return null;

    const url = (result as { data?: Array<{ url?: string }> }).data?.[0]?.url;
    if (!url) {
      console.warn('⚠️  PuLID-FLUX returned no image URL');
      return null;
    }

    console.log('✅ Image generated. Downloading...');
    const resp = await fetch(url);
    return Buffer.from(await resp.arrayBuffer());

  } catch (error) {
    console.error('❌ PuLID-FLUX image generation failed:', (error as Error).message);
    return null;
  }
}
