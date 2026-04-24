import dotenv from 'dotenv';
dotenv.config();

import { fetchGrowthData, fetchDemoFilterDiagnostic } from './supabase/queries';
import { sanitizeForPublic } from './privacy/sanitize';
import { detectMilestone } from './milestones/detector';
import { generatePosts } from './claude/generatePosts';
import { sendDraftToFounder, sendIntroductionToFounder, sendCommentaryDraft } from './telegram/sendDraft';
import { getIntroductionPosts } from './aria/introduce';
import { fetchYouTubeVideos } from './news/fetchYouTube';
import { fetchGoogleNews } from './news/fetchGoogleNews';
import { crossVerify } from './news/crossVerify';
import { generateCommentary } from './news/generateCommentary';
import { startScheduler } from './scheduler';
import { postToTwitter } from './social/twitter';
import { postToLinkedIn, checkLinkedInTokenExpiry } from './social/linkedin';

const AUTO_POST = process.env.AUTO_POST === 'true';

export async function runGrowthAgent(dryRun = false): Promise<void> {
  try {
    if (dryRun) {
      console.log('\n══════════════════════════════════════════');
      console.log('🧪 DRY RUN — nothing will be sent anywhere');
      console.log('══════════════════════════════════════════\n');
    } else {
      console.log('🎬 CineGrok Growth Agent starting...');
      console.log(`   Auto-post: ${AUTO_POST ? '✅ ON' : '📋 OFF (Telegram review only)'}`);
    }

    // ── STEP A: Demo filter diagnostic (dry-run only) ──
    if (dryRun) {
      console.log('🔍 DEMO FILTER CHECK');
      const diag = await fetchDemoFilterDiagnostic();
      console.log(`   Total filmmakers in DB  : ${diag.totalFilmmakers}`);
      console.log(`   Demo profiles (excluded): ${diag.demoFilmmakers}`);
      console.log(`   Real filmmakers          : ${diag.realFilmmakers}`);
      console.log(`   Published & real         : ${diag.publishedReal}`);
      console.log('');
    }

    // ── STEP 1: Fetch real growth data ──
    console.log('📊 Fetching growth data...');
    const rawData = await fetchGrowthData();
    console.log(`   Total real users: ${rawData.totalRealUsers} | New today: ${rawData.newToday} | New this week: ${rawData.newThisWeek}`);

    // ── STEP 2: Sanitize ──
    console.log('🔒 Sanitizing data...');
    const safeData = sanitizeForPublic(rawData);

    if (dryRun) {
      console.log('\n📋 PRIVACY AUDIT — exact JSON being sent to ADIRA:');
      console.log('──────────────────────────────────────────────────');
      console.log(JSON.stringify(safeData, null, 2));
      console.log('──────────────────────────────────────────────────\n');
    }

    // ── STEP 3: Milestone detection ──
    console.log('🎯 Detecting milestones...');
    const milestone = detectMilestone(safeData);

    if (!milestone.hasMilestone) {
      console.log('💤 No milestone today. Agent going back to sleep.');
      return;
    }

    console.log(`🎉 Milestone: [${milestone.type}] ${milestone.message}`);

    // ── STEP 4: Generate posts via ADIRA ──
    console.log('✍️  ADIRA is writing posts...');
    const posts = await generatePosts(milestone);
    console.log(`   Audience: ${posts.audience} | Image style: ${posts.imageStyle}`);

    if (dryRun) {
      console.log('\n══════════════════════════════════════════');
      console.log('📝 GENERATED POSTS (dry run — not sent)');
      console.log('══════════════════════════════════════════');
      console.log('\n📸 INSTAGRAM\n──────────────────────────────');
      console.log(posts.instagram);
      console.log('\n💼 LINKEDIN\n──────────────────────────────');
      console.log(posts.linkedin);
      console.log('\n🐦 TWITTER / X\n──────────────────────────────');
      console.log(posts.twitter);
      console.log('\n🎨 IMAGE PROMPT\n──────────────────────────────');
      console.log(posts.imagePrompt);
      console.log(`Style: ${posts.imageStyle}`);
      console.log('\n══════════════════════════════════════════');
      console.log('✅ Dry run complete. Nothing was sent.');
      console.log('   Run with --test to send to Telegram.');
      console.log('══════════════════════════════════════════\n');
      return;
    }

    // ── STEP 5: LinkedIn token expiry check ──
    await checkLinkedInTokenExpiry(async (warning) => {
      const { bot } = await import('./telegram/bot');
      await bot.sendMessage(process.env.TELEGRAM_CHAT_ID!, warning);
    });

    // ── STEP 6: Always send to Telegram ──
    console.log('📱 Sending to Telegram...');
    await sendDraftToFounder(posts);

    // ── STEP 7: Auto-post if enabled ──
    if (AUTO_POST) {
      console.log('🚀 AUTO_POST=true — posting to platforms...');
      try { await postToTwitter(posts.twitter); }
      catch (err) { console.error('❌ Twitter:', err instanceof Error ? err.message : err); }
      try { await postToLinkedIn(posts.linkedin); }
      catch (err) { console.error('❌ LinkedIn:', err instanceof Error ? err.message : err); }
    }

    console.log('✅ ADIRA completed successfully!');

  } catch (error) {
    console.error('❌ Growth Agent error:', error);
  }
}

export async function runIntroduction(): Promise<void> {
  try {
    console.log('🎙️  Sending ADIRA\'s introduction post to Telegram...');
    const posts = getIntroductionPosts();
    await sendIntroductionToFounder(posts);
    console.log('✅ Introduction sent! Set ADIRA_INTRODUCED=true in .env after you post it live.');
  } catch (error) {
    console.error('❌ Introduction error:', error);
  }
}

export async function runCommentaryAgent(): Promise<void> {
  try {
    console.log('📰 Type 2 — Fetching YouTube videos and news...');

    const [videos, news] = await Promise.all([
      fetchYouTubeVideos(),
      fetchGoogleNews(),
    ]);

    console.log(`   YouTube: ${videos.length} video(s) | News: ${news.length} item(s)`);

    const stories = crossVerify(videos, news);
    console.log(`   Cross-verified: ${stories.length} story/stories confirmed`);

    if (stories.length === 0) {
      console.log('💤 No verified stories today. Skipping Type 2.');
      return;
    }

    console.log('✍️  ADIRA is writing commentary...');
    const post = await generateCommentary(stories);

    if (!post) {
      console.log('💤 ADIRA skipped — no story worth commenting on today.');
      return;
    }

    console.log('📱 Sending commentary draft to Telegram...');
    await sendCommentaryDraft(post);

    if (AUTO_POST) {
      console.log('🚀 AUTO_POST=true — posting commentary to platforms...');
      try { await postToTwitter(post.twitter); }
      catch (err) { console.error('❌ Twitter:', err instanceof Error ? err.message : err); }
      try { await postToLinkedIn(post.linkedin); }
      catch (err) { console.error('❌ LinkedIn:', err instanceof Error ? err.message : err); }
    }

    console.log('✅ Type 2 commentary completed!');
  } catch (error) {
    console.error('❌ Commentary Agent error:', error);
  }
}

const isTestRun        = process.argv.includes('--test');
const isDryRun         = process.argv.includes('--dry-run');
const isIntroduce      = process.argv.includes('--introduce');
const isCommentaryTest = process.argv.includes('--commentary');

if (isIntroduce) {
  runIntroduction();
} else if (isDryRun) {
  runGrowthAgent(true);
} else if (isCommentaryTest) {
  console.log('🧪 TEST MODE — Running Type 2 commentary once, will send to Telegram...');
  runCommentaryAgent();
} else if (isTestRun) {
  console.log('🧪 TEST MODE — Running agent once, will send to Telegram...');
  runGrowthAgent(false);
} else {
  startScheduler();
}
