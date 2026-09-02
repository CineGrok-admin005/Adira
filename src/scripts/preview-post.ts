import dotenv from 'dotenv';
dotenv.config();

import { fetchYouTubeVideos } from '../news/fetchYouTube';
import { fetchNews } from '../news/fetchNewsData';
import { storiesFromNews } from '../news/newsStories';
import { generateCommentary } from '../news/generateCommentary';
import { COMMENTARY_SHAPES } from '../aria/postShapes';
import { serviceClient } from '../supabase/client';
import type { VerifiedStory, CommentaryPost } from '../types';

// Preview harness — see the post before anyone else does.
//
// Calls generateCommentary() DIRECTLY, never runCommentaryAgent(). That distinction is the
// whole point: the agent writes a 'posted' row to content_backlog, and hasPostedRecently()
// would then make the next scheduled cron skip for 6 hours. This publishes nothing, writes
// no backlog row, and leaves the real run intact.
//
// Run: npx ts-node src/scripts/preview-post.ts
// Cost: ~7k tokens per shape, paced 62s apart for the 12,000 TPM cap.

const BANNED = [
  'reminder', 'journey', 'marking another step', 'growing trend', "it's crucial",
  'what can you learn', 'take note', "in today's landscape", 'evolving landscape',
  'testament', 'highlights the importance of', 'sheds light on',
  'in a candid conversation', 'carved a niche',
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const [videos, news] = await Promise.all([fetchYouTubeVideos(), fetchNews()]);
  console.log(`YouTube: ${videos.length} video(s) | News: ${news.length} item(s)`);
  // MIRROR PRODUCTION EXACTLY. This script existed to answer "what will ADIRA post?", and it
  // was answering it about a different pipeline: it built its pool with crossVerify(videos,
  // news) while runCommentaryAgent (src/index.ts) switched to storiesFromNews(news). So every
  // sample reviewed here was drawn from YouTube clips that production would never see — which
  // is how "Ikka Gets CURSED By The Traitors" came up for review on 2026-09-03 when the live
  // news pool led with a director suing the CBFC. A preview that does not share the
  // production pool is worse than no preview: it produces confident, wrong answers.
  const stories: VerifiedStory[] = storiesFromNews(news);
  console.log(`Story pool: ${stories.length} article(s) from named outlets`);

  // Same YouTube fallback as production, for when the news fetch itself fails.
  if (stories.length === 0 && videos.length > 0) {
    console.log(`   ⚠️  No news available — falling back to YouTube-only (${videos.length} videos)`);
    stories.push(...videos.slice(0, 8).map((v) => ({ youtubeVideo: v, matchingNews: [], matchScore: 0 })));
  }
  console.log('');
  console.log(`Story pool: ${stories.length}\n`);

  const results: { shape: string; post: CommentaryPost }[] = [];
  for (const [i, shape] of COMMENTARY_SHAPES.entries()) {
    if (i > 0) await wait(62_000);
    const post = await generateCommentary(stories, shape);
    if (post) results.push({ shape: shape.name, post });
  }

  for (const { shape, post } of results) {
    console.log('\n' + '='.repeat(78));
    console.log(`SHAPE: ${shape}  |  ${post.linkedin.length} chars  |  ${post.sourceStory.title.slice(0, 55)}`);
    console.log('='.repeat(78));
    console.log(post.linkedin);
    console.log('\n--- INSTAGRAM ---');
    console.log(post.instagram);
  }

  console.log('\n\n' + '#'.repeat(78));
  console.log("SCORECARD — the rebuild brief's definition of done");
  console.log('#'.repeat(78));

  for (const { shape, post } of results) {
    const li = post.linkedin;
    const questions = (li.match(/\?/g) || []).length;
    const hashtags = li.match(/#\w+/g) || [];
    const hits = BANNED.filter((b) => li.toLowerCase().includes(b));
    console.log(`\n${shape}`);
    console.log(`  opens     : "${li.split('\n')[0].slice(0, 70)}"`);
    console.log(`  chars     : ${li.length}  ${li.length >= 1300 && li.length <= 2000 ? '(in band)' : '(OUTSIDE 1300-2000)'}`);
    console.log(`  questions : ${questions}${questions <= 1 ? '' : '   <-- over budget'}`);
    console.log(`  hashtags  : ${hashtags.length} ${hashtags.join(' ')}${hashtags.length <= 2 ? '' : '   <-- over 2'}`);
    console.log(`  banned    : ${hits.length ? '!! ' + hits.join(', ') : 'none'}`);
    console.log(`  "Hashtags:" printed literally: ${/hashtags\s*:/i.test(li) ? '!! YES' : 'no'}`);
    console.log(`  link in body                 : ${/https?:\/\//.test(li) ? '!! YES' : 'no'}`);
  }

  const firstFour = results.map((r) => r.post.linkedin.trim().toLowerCase().split(/\s+/).slice(0, 4).join(' '));
  console.log(`\nOpening variety: ${new Set(firstFour).size}/${firstFour.length} distinct first-four-words`);

  // These generations wrote memory rows but were never published. Leaving them would make the
  // real scheduled post steer away from openings no human has ever seen.
  const { error } = await serviceClient
    .from('adira_memory')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  const { data: after } = await serviceClient.from('adira_memory').select('id');
  console.log(`\nmemory cleaned: ${error ? 'FAILED — ' + error.message : `${after?.length ?? 0} rows remain`}`);
}

main();
