import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// NOTE: Instagram Graph API requires a media URL for image posts.
// Text-only posts aren't supported on Instagram — you need an image.
// Until you have image generation set up, leave this commented out in index.ts
// and post manually after reviewing the Telegram draft.
export async function postToInstagram(caption: string, imageUrl: string): Promise<void> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  const token = process.env.META_PAGE_ACCESS_TOKEN!;
  const baseUrl = `https://graph.facebook.com/v19.0`;

  // Step 1: Create media container with image
  const containerRes = await axios.post(`${baseUrl}/${accountId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: token,
  });

  const containerId = containerRes.data.id;

  // Step 2: Publish the container
  await axios.post(`${baseUrl}/${accountId}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });

  console.log('✅ Posted to Instagram');
}
