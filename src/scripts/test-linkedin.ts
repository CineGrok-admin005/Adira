import dotenv from 'dotenv';
dotenv.config();

import axios, { AxiosError } from 'axios';

async function main() {
  const token    = process.env.LINKEDIN_ACCESS_TOKEN!;
  const personId = process.env.LINKEDIN_PERSON_ID!;

  if (!token || !personId) {
    console.error('❌ Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_ID in .env');
    process.exit(1);
  }

  console.log(`💼 Posting test update to LinkedIn personal profile (urn:li:person:${personId})...`);

  try {
    const res = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: `urn:li:person:${personId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: 'Testing CineGrok × ADIRA integration. Building something for Indian filmmakers. 🎬\n\n— ADIRA, CineGrok\n\n#CineGrok #IndianFilmmakers',
            },
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
    console.log('✅ LinkedIn post published successfully!');
    console.log(`   Post ID: ${(res.data as Record<string, unknown>).id}`);
    console.log(`   Check: https://www.linkedin.com/in/golla-sivaji-raja/recent-activity/all/`);
  } catch (err: unknown) {
    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status;
    const data = axiosErr.response?.data as Record<string, unknown> | undefined;
    console.error(`❌ LinkedIn post failed. Status ${status}:`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }
}

main();
