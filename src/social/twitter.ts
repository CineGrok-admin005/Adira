import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
dotenv.config();

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

export async function postToTwitter(text: string): Promise<void> {
  if (process.env.TWITTER_ENABLED !== 'true') {
    console.log('⏭️  Twitter posting skipped (TWITTER_ENABLED=false) — copy from Telegram draft to post manually.');
    return;
  }

  const rwClient = client.readWrite;
  await rwClient.v2.tweet(text);
  console.log('✅ Posted to Twitter/X');
}
