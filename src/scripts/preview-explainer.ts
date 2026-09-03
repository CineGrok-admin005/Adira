import dotenv from 'dotenv';
dotenv.config();

import { serviceClient } from '../supabase/client';
import { generateExplainer } from '../explainer/generateExplainer';
import { pickExplainerSeed } from '../explainer/pickSeed';
import { EXPLAINER_SHAPES } from '../aria/postShapes';
import { findBannedPhrases, countQuestions, countHashtags } from '../aria/bannedPhrases';
import type { ExplainerPost } from '../types';

// Preview for the Type 3 Explainer. Publishes NOTHING.
//
// Calls generateExplainer() directly rather than runExplainerAgent(), for the same reason
// preview-post.ts does: the agent writes a `posted` row to content_backlog, which both makes
// hasPostedRecently() skip the real 16:07 IST run and burns the topic out of the 90-day
// rotation. It also uses the exported pickExplainerSeed() so the topic is the one the
// scheduled run would actually choose — a preview that picks its own topic is not a preview.

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  // Anything written to adira_memory after this instant belongs to this preview.
  const startedAt = new Date().toISOString();

  const seed = await pickExplainerSeed();
  console.log(`Pillar : ${seed.pillar}`);
  console.log(`Topic  : ${seed.topic}\n`);

  const results: { shape: string; post: ExplainerPost }[] = [];
  const rejected: { shape: string; reason: string }[] = [];

  for (const [i, shape] of EXPLAINER_SHAPES.entries()) {
    if (i > 0) await wait(62_000);
    try {
      results.push({ shape: shape.name, post: await generateExplainer(seed, shape) });
    } catch (err) {
      // generateExplainer THROWS on a gate rejection (commentary returns null). In production
      // that reaches the top-level catch and fires a Telegram failure alert.
      const reason = err instanceof Error ? err.message : String(err);
      rejected.push({ shape: shape.name, reason });
      console.error(`   ✖ ${shape.name}: ${reason}`);
    }
  }

  for (const { shape, post } of results) {
    console.log('\n' + '='.repeat(78));
    console.log(`SHAPE: ${shape}  |  ${post.linkedin.length} chars`);
    console.log('='.repeat(78));
    console.log(post.linkedin);
  }

  console.log('\n' + '#'.repeat(78));
  console.log('SCORECARD');
  console.log('#'.repeat(78));

  for (const { shape, post } of results) {
    const li = post.linkedin;
    const tags = li.match(/#\w+/g) ?? [];
    const banned = findBannedPhrases(li);
    console.log(`\n${shape}`);
    console.log(`  opens     : "${li.trim().split(/\s+/).slice(0, 11).join(' ')}"`);
    console.log(`  chars     : ${li.length}  ${li.length >= 1300 && li.length <= 2000 ? '(in band)' : '(OUTSIDE 1300-2000)'}`);
    console.log(`  questions : ${(li.match(/\?/g) ?? []).length}`);
    console.log(`  hashtags  : ${countHashtags(li)} ${tags.join(' ')}`);
    console.log(`  banned    : ${banned.length ? banned.join(', ') : 'none'}`);
    console.log(`  markdown  : ${/(\*\*|(^|[\s(\[‒-―-])\*(?!\s))/m.test(li) ? 'PRESENT' : 'none'}`);
    console.log(`  link body : ${/https?:\/\//.test(li.replace(/https:\/\/cinegrok\.in/g, '')) ? 'YES' : 'no'}`);
  }

  console.log(`\nPublished : ${results.length}/${EXPLAINER_SHAPES.length} shapes`);
  for (const r of rejected) console.log(`  REJECTED  ${r.shape} — ${r.reason}`);

  const { error } = await serviceClient.from('adira_memory').delete().gte('created_at', startedAt);
  const { data: after } = await serviceClient.from('adira_memory').select('id');
  console.log(`\nmemory cleaned: ${error ? 'FAILED — ' + error.message : `${after?.length ?? 0} rows remain`}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
