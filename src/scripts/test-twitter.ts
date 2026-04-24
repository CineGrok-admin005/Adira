import dotenv from 'dotenv';
dotenv.config();

import { TwitterApi } from 'twitter-api-v2';

async function main() {
  const required = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'];
  const missing = required.filter(k => !process.env[k] || process.env[k]!.includes('YOUR_'));
  if (missing.length > 0) {
    console.error(`❌ Missing or unfilled env vars: ${missing.join(', ')}`);
    console.error('   Fill these in .env before running this test.');
    process.exit(1);
  }

  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
  });

  console.log('🐦 Posting test tweet to Twitter/X...');

  try {
    const tweet = await client.readWrite.v2.tweet(
      'Testing CineGrok growth agent integration 🎬 #CineGrok #Test — ignore this tweet'
    );
    const tweetId = tweet.data.id;
    console.log('✅ Tweet posted successfully!');
    console.log(`   URL: https://twitter.com/i/web/status/${tweetId}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Twitter post failed.');
    if (message.includes('401') || message.includes('403')) {
      console.error('   Credentials are invalid or the app lacks write permission.');
      console.error('   Check: developer.twitter.com → your app → User authentication settings → App permissions = Read and Write');
    } else if (message.includes('duplicate')) {
      console.error('   Twitter rejected as duplicate — the test tweet already exists. That means credentials are working fine!');
    } else {
      console.error(`   Error: ${message}`);
    }
    process.exit(1);
  }
}

main();
