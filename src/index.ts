import dotenv from 'dotenv';
dotenv.config();

import { fetchGrowthData, fetchDemoFilterDiagnostic } from './supabase/queries';
import { sanitizeForPublic } from './privacy/sanitize';
import type { MilestoneEvent } from './types';
import { generatePosts } from './claude/generatePosts';
import { sendDraftToFounder, sendIntroductionToFounder, sendCommentaryDraft } from './telegram/sendDraft';
import { getIntroductionPosts } from './aria/introduce';
import { fetchYouTubeVideos } from './news/fetchYouTube';
import { fetchGoogleNews } from './news/fetchGoogleNews';
import { crossVerify } from './news/crossVerify';
import { generateCommentary } from './news/generateCommentary';
import { generateAdiraImage } from './image/generateImage';
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
    const { detectAllMilestones } = await import('./milestones/detector');
    const { pushToBacklog, getNextFromBacklog, supersedeMilestones, markBacklogItemPosted } = await import('./supabase/queue');

    const allMilestones = detectAllMilestones(safeData);
    let milestone: MilestoneEvent = allMilestones.length > 0 ? allMilestones[0] : { hasMilestone: false, type: 'NONE' as const, message: '', data: safeData };
    let backlogId: string | null = null;

    if (!milestone.hasMilestone) {
      console.log('💤 No organic milestone today. Checking backlog...');
      const backlogItem = await getNextFromBacklog('MILESTONE');
      if (backlogItem) {
        console.log(`📦 Found queued milestone: [${backlogItem.data.type}] ${backlogItem.data.message}`);
        milestone = backlogItem.data as MilestoneEvent;
        backlogId = backlogItem.id;
      } else {
        console.log('💤 Backlog is empty. Agent going back to sleep.');
        return;
      }
    } else {
      console.log(`🎉 Organic Milestone detected: [${milestone.type}] ${milestone.message}`);
      // Supersede older milestones since we have a fresh organic one
      await supersedeMilestones();
      // Push any secondary milestones to backlog (priority = 10 - index)
      for (let i = 1; i < allMilestones.length; i++) {
        await pushToBacklog('MILESTONE', 10 - i, allMilestones[i], 7);
      }
    }

    // ── STEP 4: Generate posts via ADIRA ──
    console.log('✍️  ADIRA is writing posts...');
    const posts = await generatePosts(milestone);
    console.log(`   Audience: ${posts.audience} | Image style: ${posts.imageStyle}`);

    if (!dryRun) {
      posts.imageBuffer = await generateAdiraImage(posts.imagePrompt, posts.imageStyle) || undefined;
    }

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
      try { await postToLinkedIn(posts.linkedin, posts.imageBuffer); }
      catch (err) { console.error('❌ LinkedIn:', err instanceof Error ? err.message : err); }

      if (backlogId) {
        const { markBacklogItemPosted } = await import('./supabase/queue');
        await markBacklogItemPosted(backlogId);
      }
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
    const { pushToBacklog, getNextFromBacklog, markBacklogItemPosted } = await import('./supabase/queue');

    const [videos, news] = await Promise.all([
      fetchYouTubeVideos(),
      fetchGoogleNews(),
    ]);

    console.log(`   YouTube: ${videos.length} video(s) | News: ${news.length} item(s)`);

    const stories = crossVerify(videos, news);
    console.log(`   Cross-verified: ${stories.length} story/stories confirmed`);

    let post = null;
    let backlogId: string | null = null;

    if (stories.length > 0) {
      // Filter out stories already posted in the last 24 hours
      const { data: recentlyPosted } = await (await import('./supabase/client')).serviceClient
        .from('content_backlog')
        .select('data')
        .eq('type', 'COMMENTARY')
        .eq('status', 'posted')
        .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const usedUrls = new Set((recentlyPosted || []).map((r: { data: { youtubeVideo?: { url?: string } } }) => r.data?.youtubeVideo?.url).filter(Boolean));
      const freshStories = stories.filter(s => !usedUrls.has(s.youtubeVideo.url));

      if (freshStories.length === 0) {
        console.log('💤 All organic stories already posted today. Checking backlog...');
      } else {
        console.log('✍️  ADIRA is writing commentary...');
        post = await generateCommentary(freshStories);

        if (post && post.sourceStory.originalIndex !== undefined) {
          const usedIdx = post.sourceStory.originalIndex;
          for (let i = 0; i < Math.min(freshStories.length, 5); i++) {
            if (i !== usedIdx) {
              await pushToBacklog('COMMENTARY', 5 - i, freshStories[i], 2);
            }
          }
        }
      }
    }

    if (!post) {
      console.log('💤 No organic stories found. Checking backlog...');
      const backlogItem = await getNextFromBacklog('COMMENTARY');
      if (backlogItem) {
        console.log(`📦 Found queued story: ${backlogItem.data.youtubeVideo.title}`);
        post = await generateCommentary([backlogItem.data]);
        backlogId = backlogItem.id;
      }
      
      if (!post) {
        console.log('💤 Backlog is empty or ADIRA skipped. Agent going back to sleep.');
        return;
      }
    }

    post.imageBuffer = await generateAdiraImage(post.imagePrompt, post.imageStyle) || undefined;

    console.log('📱 Sending commentary draft to Telegram...');
    await sendCommentaryDraft(post);

    if (AUTO_POST) {
      console.log('🚀 AUTO_POST=true — posting commentary to platforms...');
      try { await postToTwitter(post.twitter); }
      catch (err) { console.error('❌ Twitter:', err instanceof Error ? err.message : err); }
      try { await postToLinkedIn(post.linkedin, post.imageBuffer); }
      catch (err) { console.error('❌ LinkedIn:', err instanceof Error ? err.message : err); }
    }

    // Mark story as posted — prevents same story appearing at next scheduled run
    if (backlogId) {
      await markBacklogItemPosted(backlogId);
    } else {
      // Organic story — push as 'posted' so it's tracked for deduplication
      await pushToBacklog('COMMENTARY', 0, { youtubeVideo: { url: post.sourceStory.url } }, 1);
      // Immediately mark it posted
      const { data: inserted } = await (await import('./supabase/client')).serviceClient
        .from('content_backlog')
        .select('id')
        .eq('type', 'COMMENTARY')
        .eq('status', 'queued')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (inserted?.id) await markBacklogItemPosted(inserted.id);
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
