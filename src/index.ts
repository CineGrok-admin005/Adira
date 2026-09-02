import dotenv from 'dotenv';
dotenv.config();

import { fetchGrowthData, fetchDemoFilterDiagnostic } from './supabase/queries';
import { sanitizeForPublic } from './privacy/sanitize';
import type { MilestoneEvent, VerifiedStory, ExplainerPillar } from './types';
import { generatePosts } from './claude/generatePosts';
import { sendDraftToFounder, sendIntroductionToFounder, sendCommentaryDraft, sendExplainerDraft } from './telegram/sendDraft';
import { notifyFailure } from './telegram/notifyFailure';
import { getIntroductionPosts } from './aria/introduce';
import { fetchYouTubeVideos } from './news/fetchYouTube';
import { fetchNews } from './news/fetchNewsData';
import { crossVerify } from './news/crossVerify';
import { storiesFromNews } from './news/newsStories';
import { generateCommentary } from './news/generateCommentary';
import { generateExplainer } from './explainer/generateExplainer';
import { EXPLAINER_TOPICS } from './explainer/topics';
import { generateAdiraImage } from './image/generateImage';
import { saveImageCache, loadImageCache, clearImageCache, bufferToBase64, base64ToBuffer } from './image/imageCache';
import { startScheduler } from './scheduler';
import { postToTwitter } from './social/twitter';
import { postToLinkedIn, checkLinkedInTokenExpiry } from './social/linkedin';

const AUTO_POST = process.env.AUTO_POST === 'true';

// Milestones that are only true "today" — never re-queue them (they'd resurface stale).
const DATE_SENSITIVE_MILESTONES = new Set(['DAILY_UPDATE', 'FIRST_NEW_CITY', 'FIRST_FEMALE', 'WEEKLY_SUMMARY']);

// Stable per-milestone signature so the same event never posts twice across days.
function milestoneSignature(m: MilestoneEvent): string {
  const d = m.data;
  switch (m.type) {
    case 'COUNT_MILESTONE': return `COUNT_${d.milestoneHit}`;
    case 'VIEW_MILESTONE':  return `VIEW_${m.message}`;
    case 'CITY_MILESTONE':  return `CITY_${d.uniqueCities}`;
    case 'FIRST_FEMALE':    return `FIRST_FEMALE_${d.firstFemaleFilmmaker?.firstName ?? ''}_${d.firstFemaleFilmmaker?.city ?? ''}`;
    case 'FIRST_NEW_CITY':  return `FIRST_NEW_CITY_${d.firstFromNewCity?.city ?? ''}`;
    case 'DAILY_UPDATE':    return `DAILY_${new Date().toISOString().split('T')[0]}`;
    case 'WEEKLY_SUMMARY':  return `WEEKLY_${new Date().toISOString().split('T')[0]}`;
    default:                return m.type;
  }
}

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

    if (!dryRun) {
      const { hasPostedRecently, purgeExpiredBacklog } = await import('./supabase/queue');
      if (await hasPostedRecently('MILESTONE')) {
        console.log('💤 Milestone already posted recently — skipping (duplicate-trigger guard).');
        return;
      }
      await purgeExpiredBacklog();
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
    const { pushToBacklog, getNextFromBacklog, supersedeMilestones } = await import('./supabase/queue');

    const allMilestones = detectAllMilestones(safeData);

    // Dedup — drop milestones already posted in the last 30 days, so a new joiner / event
    // posts ONCE and never resurfaces on later days.
    const { serviceClient } = await import('./supabase/client');
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: postedRows } = await serviceClient
      .from('content_backlog')
      .select('data')
      .eq('type', 'MILESTONE')
      .eq('status', 'posted')
      .gte('created_at', since);
    const postedSigs = new Set(
      (postedRows || []).map((r: { data?: { signature?: string } }) => r.data?.signature).filter(Boolean)
    );
    const freshMilestones = allMilestones.filter(m => !postedSigs.has(milestoneSignature(m)));
    if (allMilestones.length !== freshMilestones.length) {
      console.log(`   Skipped ${allMilestones.length - freshMilestones.length} already-posted milestone(s).`);
    }

    let milestone: MilestoneEvent = freshMilestones.length > 0 ? freshMilestones[0] : { hasMilestone: false, type: 'NONE' as const, message: '', data: safeData };
    let backlogId: string | null = null;

    if (!milestone.hasMilestone) {
      console.log('💤 No fresh organic milestone today. Checking backlog...');
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
      // Queue only EVERGREEN secondaries (skip date-sensitive ones that go stale tomorrow),
      // with a short 2-day shelf life so nothing lingers and resurfaces.
      for (let i = 1; i < freshMilestones.length; i++) {
        const m = freshMilestones[i];
        if (DATE_SENSITIVE_MILESTONES.has(m.type)) continue;
        await pushToBacklog('MILESTONE', 10 - i, m, 2);
      }
    }

    // ── STEP 4: Generate posts via ADIRA ──
    console.log('✍️  ADIRA is writing posts...');
    const posts = await generatePosts(milestone);
    console.log(`   Audience: ${posts.audience} | Image style: ${posts.imageStyle}`);

    if (!dryRun) {
      const cached = loadImageCache('type1');
      if (cached) {
        posts.imageBuffer = base64ToBuffer(cached.imageBase64);
        clearImageCache('type1');
      } else {
        const speechBubble = posts.imagePrompt.match(/SPEECH BUBBLE:\s*(.+)/i)?.[1]?.trim();
        posts.imageBuffer = await generateAdiraImage(posts.imagePrompt, posts.imageStyle, posts.emotion, speechBubble) || undefined;
      }
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

    // Record this milestone as posted (by signature) so it never resurfaces on a later day.
    await serviceClient.from('content_backlog').insert({
      type: 'MILESTONE',
      status: 'posted',
      priority: 0,
      // `signature` is load-bearing (the 30-day dedup above reads it); `post` is the archive.
      data: {
        signature: milestoneSignature(milestone),
        mtype: milestone.type,
        message: milestone.message,
        post: {
          linkedin: posts.linkedin,
          instagram: posts.instagram,
          twitter: posts.twitter,
          linkedinChars: posts.linkedin.length,
          imageStyle: posts.imageStyle,
          emotion: posts.emotion,
          audience: posts.audience,
        },
      },
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // ── STEP 7: Auto-post if enabled ──
    if (AUTO_POST) {
      console.log('🚀 AUTO_POST=true — posting to platforms...');
      try { await postToTwitter(posts.twitter); }
      catch (err) { console.error('❌ Twitter:', err instanceof Error ? err.message : err); }
      try { await postToLinkedIn(posts.linkedin, posts.imageBuffer); }
      catch (err) { console.error('❌ LinkedIn:', err instanceof Error ? err.message : err); await notifyFailure('LinkedIn publish FAILED — the row will still say posted', err); }

      if (backlogId) {
        const { markBacklogItemPosted } = await import('./supabase/queue');
        await markBacklogItemPosted(backlogId);
      }
    }

    console.log('✅ ADIRA completed successfully!');

  } catch (error) {
    console.error('❌ Growth Agent error:', error);
    await notifyFailure('Growth report (Type 1)', error);
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
    const { pushToBacklog, getNextFromBacklog, markBacklogItemPosted, hasPostedRecently, purgeExpiredBacklog } = await import('./supabase/queue');

    if (await hasPostedRecently('COMMENTARY')) {
      console.log('💤 Commentary already posted recently — skipping (duplicate-trigger guard).');
      return;
    }
    await purgeExpiredBacklog();

    console.log('📰 Type 2 — Fetching YouTube videos and news...');

    const [videos, news] = await Promise.all([
      fetchYouTubeVideos(),
      fetchNews(), // NewsData.io (server-friendly) + Google News RSS, deduped
    ]);

    console.log(`   YouTube: ${videos.length} video(s) | News: ${news.length} item(s)`);

    // News-first: a named publication reporting something is a better signal than a
    // channel uploading a promo, and it needs no matching step — which removes the whole
    // class of mismatch that had ADIRA declining coherent-looking but unrelated pairs.
    // See src/news/newsStories.ts for the observed failures that motivated this.
    const stories: VerifiedStory[] = storiesFromNews(news);
    console.log(`   Story pool: ${stories.length} article(s) from named outlets`);

    // YouTube is kept only as a fallback for when the news fetch itself fails, so a
    // NewsData outage degrades to something rather than nothing.
    if (stories.length === 0 && videos.length > 0) {
      console.log(`   ⚠️  No news available — falling back to YouTube-only (${videos.length} videos)`);
      stories.push(...videos.slice(0, 8).map(v => ({ youtubeVideo: v, matchingNews: [], matchScore: 0 })));
    }

    let post = null;
    let backlogId: string | null = null;

    if (stories.length > 0) {
      // Filter out stories already posted in the last 24 hours
      const { data: recentlyPosted } = await (await import('./supabase/client')).serviceClient
        .from('content_backlog')
        .select('data')
        .eq('type', 'COMMENTARY')
        .eq('status', 'posted')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      // Deduplicate by URL AND by topic (proper noun overlap) — prevents same film reviewed by different channels
      const usedUrls   = new Set((recentlyPosted || []).map((r: { data: { youtubeVideo?: { url?: string } } }) => r.data?.youtubeVideo?.url).filter(Boolean));
      const usedTitles = (recentlyPosted || []).map((r: { data: { youtubeVideo?: { title?: string } } }) => r.data?.youtubeVideo?.title || '').filter(Boolean);

      function titleProperNouns(title: string): string[] {
        return (title.match(/\b[A-Z][a-zA-Z]{1,}\b/g) || []).filter(w => w.length > 2);
      }
      function topicAlreadyCovered(title: string): boolean {
        const nouns = titleProperNouns(title);
        return usedTitles.some(used => {
          const usedNouns = titleProperNouns(used);
          return nouns.some(n => usedNouns.some(u => u.toLowerCase() === n.toLowerCase()));
        });
      }

      const freshStories = stories.filter(s => !usedUrls.has(s.youtubeVideo.url) && !topicAlreadyCovered(s.youtubeVideo.title));

      if (freshStories.length === 0) {
        console.log('💤 All organic stories already posted today. Checking backlog...');
      } else {
        console.log('✍️  ADIRA is writing commentary...');
        // Work down the ranked pool instead of giving up after one attempt.
        //
        // Measured 2026-09-03: ~40% of scheduled slots published nothing even outside the
        // Aug 12-25 outage. The cause was here — one attempt at the top 3 stories, and if
        // the model returned NO_WORTHWHILE_STORY the only retry was a SINGLE backlog item
        // that had just been rejected, which then failed the beat filter again inside
        // generateCommentary. Stories 4 through 22 of a perfectly good ranked pool were
        // never tried at all.
        //
        // Attempts are spaced because Groq free tier caps at 8,000 tokens/MINUTE and one
        // generation costs ~6-7k — two back-to-back would 413. The workflow has a 15-minute
        // timeout, so three spaced attempts fit comfortably.
        const ATTEMPT_SIZE = 3;
        const MAX_ATTEMPTS = 3;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const slice = freshStories.slice(attempt * ATTEMPT_SIZE, (attempt + 1) * ATTEMPT_SIZE);
          if (slice.length === 0) break;

          if (attempt > 0) {
            console.log(`   ⏳ Attempt ${attempt + 1}/${MAX_ATTEMPTS} — waiting 65s for the token window...`);
            await new Promise(r => setTimeout(r, 65_000));
          }

          post = await generateCommentary(slice);
          if (post) break;
          console.log(`   ↻ No story in that batch cleared the gate — trying the next ${ATTEMPT_SIZE}.`);
        }

        // Queue the stories we did NOT use, so a later run can try them.
        //
        // Excluded by URL, not by index: with the multi-batch retry above, a post found on
        // attempt 2 carries an originalIndex relative to its 3-story SLICE, not to
        // freshStories — so index matching would queue the story we just published and skip
        // an unused one. URL is stable across both.
        const usedUrl = post?.sourceStory?.url;
        for (let i = 0; i < Math.min(freshStories.length, 5); i++) {
          if (freshStories[i].youtubeVideo.url === usedUrl) continue;
          await pushToBacklog('COMMENTARY', 5 - i, freshStories[i], 2);
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

    const cachedCommentary = loadImageCache('type2');
    if (cachedCommentary) {
      post.imageBuffer = base64ToBuffer(cachedCommentary.imageBase64);
      clearImageCache('type2');
    } else {
      const speechBubble = post.imagePrompt.match(/SPEECH BUBBLE:\s*(.+)/i)?.[1]?.trim();
      post.imageBuffer = await generateAdiraImage(post.imagePrompt, post.imageStyle, post.emotion, speechBubble) || undefined;
    }

    console.log('📱 Sending commentary draft to Telegram...');
    await sendCommentaryDraft(post);

    if (AUTO_POST) {
      console.log('🚀 AUTO_POST=true — posting commentary to LinkedIn...');
      // Twitter is intentionally NOT auto-posted: tweets are now written manually
      // from the TWEET BRIEF via the Tweets Claude project (X API also costs money).
      try { await postToLinkedIn(post.linkedin, post.imageBuffer); }
      catch (err) { console.error('❌ LinkedIn:', err instanceof Error ? err.message : err); await notifyFailure('LinkedIn publish FAILED — the row will still say posted', err); }
    }

    // Mark story as posted — prevents same story appearing at next scheduled run
    if (backlogId) {
      await markBacklogItemPosted(backlogId);
    } else {
      // Organic story — push as 'posted' with title for topic-based deduplication.
      // `youtubeVideo` keys are load-bearing (the 24h dedup at the top of this function reads
      // them); `post` is additive — the archive that lets us actually review what ADIRA wrote.
      await pushToBacklog('COMMENTARY', 0, {
        youtubeVideo: { url: post.sourceStory.url, title: post.sourceStory.title },
        post: {
          linkedin: post.linkedin,
          instagram: post.instagram,
          tweetBrief: post.tweetBrief,
          linkedinChars: post.linkedin.length,
          shapeName: post.shapeName,
          imageStyle: post.imageStyle,
          emotion: post.emotion,
          audience: post.audience,
        },
      }, 1);
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
    await notifyFailure('Commentary (Type 2)', error);
  }
}

// Picks the next Explainer topic: excludes the immediately-previous pillar and anything posted
// in the last ~90 days; drops the pillar constraint, then falls back to least-recently-used
// (never-used first), if the bank is exhausted under those constraints. Deterministic per IST
// calendar day (not random per call) so a pre-warm run and the real run later that day always
// pick the same topic — otherwise a cached pre-warmed image could mismatch the real post's topic.
async function pickExplainerSeed(): Promise<{ pillar: ExplainerPillar; topic: string }> {
  const { serviceClient } = await import('./supabase/client');
  const { data: rows } = await serviceClient
    .from('content_backlog')
    .select('data, created_at')
    .eq('type', 'EXPLAINER')
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(200);

  const posted = (rows || []) as { data: { pillar?: string; topic?: string }; created_at: string }[];
  const lastPillar = posted[0]?.data?.pillar;
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const usedWithin90d = new Set(
    posted.filter(r => new Date(r.created_at).getTime() >= ninetyDaysAgo).map(r => r.data?.topic).filter(Boolean)
  );

  let candidates = EXPLAINER_TOPICS.filter(t => !usedWithin90d.has(t.topic) && t.pillar !== lastPillar);
  if (candidates.length === 0) candidates = EXPLAINER_TOPICS.filter(t => !usedWithin90d.has(t.topic));

  if (candidates.length === 0) {
    // Bank exhausted within 90 days for every topic — fall back to least-recently-used (never-used first)
    const lastUsedAt = new Map<string, number>();
    for (const r of posted) {
      const topic = r.data?.topic;
      if (topic && !lastUsedAt.has(topic)) lastUsedAt.set(topic, new Date(r.created_at).getTime());
    }
    candidates = [...EXPLAINER_TOPICS].sort((a, b) => (lastUsedAt.get(a.topic) ?? 0) - (lastUsedAt.get(b.topic) ?? 0));
    return candidates[0];
  }

  const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
  let hash = 0;
  for (const ch of todayIST) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return candidates[hash % candidates.length];
}

export async function runExplainerAgent(): Promise<void> {
  try {
    const { pushToBacklog, markBacklogItemPosted, hasPostedRecently } = await import('./supabase/queue');

    if (await hasPostedRecently('EXPLAINER')) {
      console.log('💤 Explainer already posted recently — skipping (duplicate-trigger guard).');
      return;
    }

    console.log('📚 Type 3 — Explainer post starting...');
    const seed = await pickExplainerSeed();
    console.log(`   Pillar: ${seed.pillar} | Topic: ${seed.topic}`);

    console.log('✍️  ADIRA is writing the explainer post...');
    const post = await generateExplainer(seed);
    console.log(`   Audience: ${post.audience} | Image style: ${post.imageStyle}`);

    const cached = loadImageCache('type3');
    if (cached) {
      post.imageBuffer = base64ToBuffer(cached.imageBase64);
      clearImageCache('type3');
    } else {
      const speechBubble = post.imagePrompt.match(/SPEECH BUBBLE:\s*(.+)/i)?.[1]?.trim();
      post.imageBuffer = await generateAdiraImage(post.imagePrompt, post.imageStyle, post.emotion, speechBubble) || undefined;
    }

    await checkLinkedInTokenExpiry(async (warning) => {
      const { bot } = await import('./telegram/bot');
      await bot.sendMessage(process.env.TELEGRAM_CHAT_ID!, warning);
    });

    console.log('📱 Sending explainer draft to Telegram...');
    await sendExplainerDraft(post);

    // Dedup ledger only — Explainer never queues unposted content, it generates fresh every run.
    // `pillar`/`topic` are load-bearing (pickExplainerSeed reads them); `post` is the archive.
    await pushToBacklog('EXPLAINER', 0, {
      pillar: seed.pillar,
      topic: seed.topic,
      post: {
        linkedin: post.linkedin,
        tweetBrief: post.tweetBrief,
        linkedinChars: post.linkedin.length,
        shapeName: post.shapeName,
        imageStyle: post.imageStyle,
        emotion: post.emotion,
        audience: post.audience,
      },
    }, 120);
    const { data: inserted } = await (await import('./supabase/client')).serviceClient
      .from('content_backlog')
      .select('id')
      .eq('type', 'EXPLAINER')
      .eq('status', 'queued')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (inserted?.id) await markBacklogItemPosted(inserted.id);

    if (AUTO_POST) {
      console.log('🚀 AUTO_POST=true — posting explainer to LinkedIn...');
      try { await postToLinkedIn(post.linkedin, post.imageBuffer); }
      catch (err) { console.error('❌ LinkedIn:', err instanceof Error ? err.message : err); await notifyFailure('LinkedIn publish FAILED — the row will still say posted', err); }
    }

    console.log('✅ Type 3 explainer completed!');
  } catch (error) {
    console.error('❌ Explainer Agent error:', error);
    await notifyFailure('Explainer (Type 3)', error);
  }
}

// Pre-warm Type 1: generate text + image 30 min before 8 AM, cache to disk
export async function preWarmType1(): Promise<void> {
  try {
    console.log('⏰ Pre-warming Type 1 image...');
    const rawData  = await fetchGrowthData();
    const safeData = sanitizeForPublic(rawData);
    const { detectAllMilestones } = await import('./milestones/detector');
    const all = detectAllMilestones(safeData);
    if (all.length === 0) { console.log('💤 No milestone to pre-warm for.'); return; }
    const posts = await generatePosts(all[0] as MilestoneEvent);
    const speechBubble = posts.imagePrompt.match(/SPEECH BUBBLE:\s*(.+)/i)?.[1]?.trim();
    const buf = await generateAdiraImage(posts.imagePrompt, posts.imageStyle, posts.emotion, speechBubble);
    if (buf) {
      saveImageCache('type1', { generatedAt: new Date().toISOString(), imageBase64: bufferToBase64(buf), prompt: posts.imagePrompt, style: posts.imageStyle, emotion: posts.emotion, speechBubble });
      console.log('✅ Type 1 image pre-warmed and cached.');
    }
  } catch (err) { console.error('❌ Pre-warm Type 1 failed:', (err as Error).message); }
}

// Pre-warm Type 2: fetch news, pick story, generate image 30 min before commentary slot
export async function preWarmType2(): Promise<void> {
  try {
    console.log('⏰ Pre-warming Type 2 image...');
    const [videos, news] = await Promise.all([fetchYouTubeVideos(), fetchNews()]);
    const stories = crossVerify(videos, news);
    if (stories.length === 0) { console.log('💤 No stories to pre-warm for.'); return; }
    const post = await generateCommentary(stories);
    if (!post) { console.log('💤 No commentary generated for pre-warm.'); return; }
    const speechBubble = post.imagePrompt.match(/SPEECH BUBBLE:\s*(.+)/i)?.[1]?.trim();
    const buf = await generateAdiraImage(post.imagePrompt, post.imageStyle, post.emotion, speechBubble);
    if (buf) {
      saveImageCache('type2', { generatedAt: new Date().toISOString(), imageBase64: bufferToBase64(buf), prompt: post.imagePrompt, style: post.imageStyle, emotion: post.emotion, speechBubble });
      console.log('✅ Type 2 image pre-warmed and cached.');
    }
  } catch (err) { console.error('❌ Pre-warm Type 2 failed:', (err as Error).message); }
}

// Pre-warm Type 3: pick the day's Explainer topic, generate image 30 min before the explainer slot
export async function preWarmType3(): Promise<void> {
  try {
    console.log('⏰ Pre-warming Type 3 image...');
    const seed = await pickExplainerSeed();
    const post = await generateExplainer(seed);
    const speechBubble = post.imagePrompt.match(/SPEECH BUBBLE:\s*(.+)/i)?.[1]?.trim();
    const buf = await generateAdiraImage(post.imagePrompt, post.imageStyle, post.emotion, speechBubble);
    if (buf) {
      saveImageCache('type3', { generatedAt: new Date().toISOString(), imageBase64: bufferToBase64(buf), prompt: post.imagePrompt, style: post.imageStyle, emotion: post.emotion, speechBubble });
      console.log('✅ Type 3 image pre-warmed and cached.');
    }
  } catch (err) { console.error('❌ Pre-warm Type 3 failed:', (err as Error).message); }
}

const isTestRun        = process.argv.includes('--test');
const isDryRun         = process.argv.includes('--dry-run');
const isIntroduce      = process.argv.includes('--introduce');
const isCommentaryTest = process.argv.includes('--commentary');
const isExplainerTest  = process.argv.includes('--explainer');
const isRunGrowth      = process.argv.includes('--run-growth');      // GitHub Actions trigger
const isRunCommentary  = process.argv.includes('--run-commentary');   // GitHub Actions trigger
const isRunExplainer   = process.argv.includes('--run-explainer');    // GitHub Actions trigger
const isPreWarm1       = process.argv.includes('--prewarm-growth');
const isPreWarm2       = process.argv.includes('--prewarm-commentary');
const isPreWarm3       = process.argv.includes('--prewarm-explainer');

if (isIntroduce) {
  runIntroduction();
} else if (isDryRun) {
  runGrowthAgent(true);
} else if (isCommentaryTest) {
  console.log('🧪 TEST MODE — Running Type 2 commentary once, will send to Telegram...');
  runCommentaryAgent();
} else if (isExplainerTest) {
  console.log('🧪 TEST MODE — Running Type 3 explainer once, will send to Telegram...');
  runExplainerAgent();
} else if (isTestRun) {
  console.log('🧪 TEST MODE — Running agent once, will send to Telegram...');
  runGrowthAgent(false);
} else if (isRunGrowth) {
  // Called by GitHub Actions at ~8 AM IST — runs once and exits
  runGrowthAgent(false);
} else if (isRunCommentary) {
  // Called by GitHub Actions at ~12 PM and ~8 PM IST — runs once and exits
  runCommentaryAgent();
} else if (isRunExplainer) {
  // Called by GitHub Actions at ~4 PM IST — runs once and exits
  runExplainerAgent();
} else if (isPreWarm1) {
  preWarmType1();
} else if (isPreWarm2) {
  preWarmType2();
} else if (isPreWarm3) {
  preWarmType3();
} else {
  // Fallback: Railway persistent mode with node-cron scheduler
  startScheduler();
}
