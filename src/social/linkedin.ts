import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function checkLinkedInTokenExpiry(sendWarning: (msg: string) => Promise<void>): Promise<void> {
  const expiresAt = process.env.LINKEDIN_TOKEN_EXPIRES_AT;
  if (!expiresAt) return;

  const raw = expiresAt.trim().split(' ')[0];
  const asNumber = Number(raw);
  const expiryDate = !isNaN(asNumber) && asNumber > 1e9
    ? new Date(asNumber * 1000)
    : new Date(raw);

  const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 7) {
    const warning = `⚠️ LinkedIn token expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Refresh it at linkedin.com/developers`;
    console.warn(warning);
    await sendWarning(warning);
  }
}

export async function postToLinkedIn(text: string): Promise<void> {
  const token     = process.env.LINKEDIN_ACCESS_TOKEN!;
  const personId  = process.env.LINKEDIN_PERSON_ID!;

  if (!personId) {
    throw new Error('LINKEDIN_PERSON_ID not set. Run the token refresh flow to get it.');
  }

  try {
    await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: `urn:li:person:${personId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    console.log('✅ Posted to LinkedIn (personal profile: Sivaji Raja)');
  } catch (err: unknown) {
    const axiosErr = err as AxiosError;
    if (axiosErr.response?.status === 401) {
      throw new Error('LinkedIn token expired. Regenerate at linkedin.com/developers');
    }
    throw err;
  }
}
