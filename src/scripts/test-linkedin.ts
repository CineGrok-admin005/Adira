import dotenv from 'dotenv';
dotenv.config();

import axios, { AxiosError } from 'axios';

async function main() {
  const required = ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_ORGANIZATION_ID'];
  const missing = required.filter(k => !process.env[k] || process.env[k]!.includes('YOUR_'));
  if (missing.length > 0) {
    console.error(`❌ Missing or unfilled env vars: ${missing.join(', ')}`);
    console.error('   Fill these in .env before running this test.');
    process.exit(1);
  }

  const orgId = process.env.LINKEDIN_ORGANIZATION_ID!;
  const token = process.env.LINKEDIN_ACCESS_TOKEN!;

  console.log('💼 Posting test update to LinkedIn company page...');

  try {
    await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: `urn:li:organization:${orgId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: 'Testing CineGrok growth agent integration. Building something exciting for Indian filmmakers 🎬',
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
    console.log(`   Check your company page: https://www.linkedin.com/company/${orgId}/posts/`);
  } catch (err: unknown) {
    const axiosErr = err as AxiosError;
    const status = axiosErr.response?.status;
    const data = axiosErr.response?.data as Record<string, unknown> | undefined;
    console.error('❌ LinkedIn post failed.');
    if (status === 401) {
      console.error('   Token is invalid or expired. Generate a new one at linkedin.com/developers.');
    } else if (status === 403) {
      console.error('   Token lacks permission. Ensure scope includes: w_member_social or w_organization_social.');
    } else if (status === 404) {
      console.error('   Organization ID not found. Check LINKEDIN_ORGANIZATION_ID in .env.');
    } else {
      console.error(`   Status ${status}:`, JSON.stringify(data, null, 2));
    }
    process.exit(1);
  }
}

main();
