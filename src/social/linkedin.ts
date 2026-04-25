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

export async function postToLinkedIn(text: string, imageBuffer?: Buffer): Promise<void> {
  const token     = process.env.LINKEDIN_ACCESS_TOKEN!;
  const personId  = process.env.LINKEDIN_PERSON_ID!;

  if (!personId) {
    throw new Error('LINKEDIN_PERSON_ID not set. Run the token refresh flow to get it.');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };

  try {
    let assetUrn: string | undefined;

    // If there's an image, we do the 3-step upload process
    if (imageBuffer) {
      console.log('🖼️ Registering image upload with LinkedIn...');
      
      // Step 1: Register Upload
      const registerRes = await axios.post(
        'https://api.linkedin.com/v2/assets?action=registerUpload',
        {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: `urn:li:person:${personId}`,
            serviceRelationships: [
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
          },
        },
        { headers }
      );

      assetUrn = registerRes.data.value.asset;
      const uploadUrl = registerRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;

      // Step 2: Upload Binary
      console.log('⬆️ Uploading image binary to LinkedIn...');
      await axios.put(uploadUrl, imageBuffer, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream'
        }
      });
      console.log('✅ Image uploaded successfully to LinkedIn.');
    }

    // Step 3: Create the UGC Post
    const shareContent: any = {
      shareCommentary: { text },
      shareMediaCategory: assetUrn ? 'IMAGE' : 'NONE',
    };

    if (assetUrn) {
      shareContent.media = [
        {
          status: 'READY',
          media: assetUrn,
        },
      ];
    }

    await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: `urn:li:person:${personId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': shareContent,
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      },
      { headers }
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
