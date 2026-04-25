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

    // Style-specific prompt suffix
    const styleMap: Record<string, string> = {
      Cinematic: 'editorial illustration, graphic novel style, cinematic lighting, Indian cinema aesthetic',
      Moody:     'editorial illustration, graphic novel style, moody dramatic lighting, deep shadows',
      Surreal:   'editorial illustration, graphic novel style, surreal dreamlike atmosphere',
    };
    const styleSuffix = styleMap[style] ?? styleMap.Cinematic;

    const fullPrompt = `ADIRA, Indian woman reporter, ${prompt}, ${styleSuffix}, press lanyard, high quality, detailed`;

    const result: unknown = await app.predict('/run', [
      fullPrompt,                                    // prompt
      faceBlob,                                      // id_image
      1,                                             // id_weight (1 = strong identity)
      1024,                                          // width
      1024,                                          // height
      28,                                            // num_steps
      1,                                             // timestep_to_start_cfg (1 for illustrated/stylized)
      4,                                             // guidance
      -1,                                            // seed (-1 = random)
      128,                                           // max_sequence_length
    ]);

    const data = (result as { data?: Array<{ url?: string }> }).data;
    const imageUrl = data?.[0]?.url;

    if (!imageUrl) {
      console.warn('⚠️  PuLID-FLUX returned no image URL');
      return null;
    }

    console.log('✅ Image generated. Downloading...');
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);

  } catch (error) {
    console.error('❌ PuLID-FLUX image generation failed:', (error as Error).message);
    return null;
  }
}
