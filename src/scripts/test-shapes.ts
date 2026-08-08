import dotenv from 'dotenv';
dotenv.config();

import { serviceClient } from '../supabase/client';
import { COMMENTARY_SHAPES, EXPLAINER_SHAPES } from '../aria/postShapes';
import { generateCommentary } from '../news/generateCommentary';
import { generateExplainer } from '../explainer/generateExplainer';
import { EXPLAINER_TOPICS } from '../explainer/topics';
import type { VerifiedStory } from '../types';

// Shape smoke test.
//
// A malformed section makes generateCommentary return null and the run exit quietly, so a
// shape the model formats badly would silently stop publishing with no signal at all. This
// exercises every arc against one fixed stored story and asserts the post actually parsed.
//
// Run:  npx ts-node src/scripts/test-shapes.ts
//
// Cost: one Groq call per shape. A full 6-shape run is ~40,000 tokens — and the free tier
// has TWO caps, not one: 12,000 tokens/MINUTE (which the pacing below handles) and
// 100,000 tokens/DAY (which it cannot). A full run is therefore ~40% of the daily budget,
// so budget for at most two runs a day alongside normal posting.
//
// A 429 is reported as SKIPPED, never FAILED: exhausting the quota says nothing about
// whether a shape parses, and conflating the two would either mask a real defect or send
// someone chasing a prompt bug that does not exist.

const PACE_MS = 65_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = 'ok' | 'failed' | 'skipped';
interface Result { kind: string; shape: string; status: Status; detail: string }

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('rate_limit_exceeded') || msg.includes('429');
}

function rateLimitDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const scope = /tokens per day|TPD/i.test(msg) ? 'daily (TPD)' : 'per-minute (TPM)';
  const retry = msg.match(/try again in ([\dhms.]+)/i)?.[1];
  return `Groq ${scope} quota exhausted${retry ? ` — retry in ${retry}` : ''}`;
}

async function fixedStory(): Promise<VerifiedStory | null> {
  // Reuse a real stored story so the test exercises the same prompt shape production sees.
  const { data } = await serviceClient
    .from('content_backlog')
    .select('data')
    .eq('type', 'COMMENTARY')
    .not('data->matchingNews', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const story = data?.data as VerifiedStory | undefined;
  return story?.youtubeVideo && story?.matchingNews ? story : null;
}

async function main(): Promise<void> {
  const results: Result[] = [];
  const story = await fixedStory();

  if (!story) {
    console.error('❌ No stored story with matchingNews found — cannot run the commentary shapes.');
  }

  let first = true;
  for (const shape of COMMENTARY_SHAPES) {
    if (!story) break;
    if (!first) await wait(PACE_MS);
    first = false;
    try {
      const post = await generateCommentary([story], shape);
      if (!post) {
        results.push({ kind: 'commentary', shape: shape.name, status: 'failed', detail: 'returned null (parse failed or NO_WORTHWHILE_STORY)' });
      } else {
        const ok = post.linkedin.trim().length > 0 && post.instagram.trim().length > 0;
        results.push({ kind: 'commentary', shape: shape.name, status: ok ? 'ok' : 'failed', detail: `linkedin ${post.linkedin.length} chars, instagram ${post.instagram.length} chars` });
      }
    } catch (err) {
      const rateLimited = isRateLimit(err);
      results.push({ kind: 'commentary', shape: shape.name, status: rateLimited ? 'skipped' : 'failed', detail: rateLimited ? rateLimitDetail(err) : `threw: ${(err as Error).message}` });
    }
  }

  for (const shape of EXPLAINER_SHAPES) {
    await wait(PACE_MS);
    try {
      const post = await generateExplainer(EXPLAINER_TOPICS[0], shape);
      const ok = post.linkedin.trim().length > 0;
      results.push({ kind: 'explainer', shape: shape.name, status: ok ? 'ok' : 'failed', detail: `linkedin ${post.linkedin.length} chars` });
    } catch (err) {
      const rateLimited = isRateLimit(err);
      results.push({ kind: 'explainer', shape: shape.name, status: rateLimited ? 'skipped' : 'failed', detail: rateLimited ? rateLimitDetail(err) : `threw: ${(err as Error).message}` });
    }
  }

  const icon: Record<Status, string> = { ok: '✅', failed: '❌', skipped: '⏭️ ' };

  console.log('\n════════ SHAPE SMOKE TEST ════════');
  for (const r of results) {
    console.log(`${icon[r.status]} ${r.kind.padEnd(11)} ${r.shape.padEnd(22)} ${r.detail}`);
  }

  const passed = results.filter((r) => r.status === 'ok');
  const failed = results.filter((r) => r.status === 'failed');
  const skipped = results.filter((r) => r.status === 'skipped');

  console.log(`\n${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped (of ${results.length}).`);

  if (failed.length > 0) {
    console.error('\n❌ A failing shape would silently stop publishing in production. Fix before shipping.');
    process.exitCode = 1;
  } else if (skipped.length > 0) {
    // Not a pass. Quota exhaustion leaves those shapes unverified, and shipping an
    // unverified shape is the exact risk this script exists to remove.
    console.error(`\n⚠️  ${skipped.length} shape(s) UNVERIFIED — the Groq quota ran out before they ran.`);
    console.error('   Nothing is proven broken, but nothing is proven working either.');
    console.error('   Re-run once the quota resets and require a clean pass before shipping.');
    process.exitCode = 2;
  } else {
    console.log('\n✅ Every shape parsed. Safe to ship.');
  }
}

main();
