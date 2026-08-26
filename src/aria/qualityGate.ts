import { resolveModels, reasoningParamsFor } from '../llm/models';
import Groq from 'groq-sdk';
import { getLinkedInRetryVoiceContext } from './characterCard';
import { findBannedPhrases, countQuestions, countHashtags } from './bannedPhrases';

// Post-generation quality gate.
//
// Order of preference: fix mechanically where a rule is mechanical (hashtag count), ask the
// model to rewrite only where judgment is needed (banned phrases, question budget), and
// reject outright if the rewrite doesn't land. Rejection is the point — the brief's rule is
// that silence beats filler, because filler degrades the account's distribution baseline for
// everything published after it.

const MAX_HASHTAGS = 2;
const MAX_QUESTIONS = 1;

export interface QualityResult {
  text: string;
  passed: boolean;
  violations: string[];
  rewritten: boolean;
}

// Deterministic: keep the first N hashtags, drop the rest. No model call needed.
export function capHashtags(text: string, max = MAX_HASHTAGS): string {
  let seen = 0;
  return text
    .replace(/#\w+/g, (tag) => (++seen <= max ? tag : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Every significant figure in the post must appear in the source. A reporter's whole value
// is that she checked; on 2026-08-09 ADIRA published "50,000 screens overseas" — a quarter of
// every cinema screen on earth — from a Hindi clickbait title that contained no number at all.
// Nothing in the pipeline could tell an invented figure from a reported one.
//
// Only figures that carry weight: 3+ digits, or any number attached to crore/lakh/cr/%/₹/$.
// Years and small counts are ignored — too noisy, too rarely load-bearing.
export function findUnsourcedNumbers(post: string, source: string): string[] {
  const norm = (s: string) => s.replace(/[,\s]/g, '');
  const haystack = norm(source);

  const matches = post.match(/(?:[₹$]\s?)?\d[\d,]*(?:\.\d+)?\s*(?:crore|cr\b|lakh|million|billion|%)?/gi) ?? [];
  const unsourced = new Set<string>();

  for (const raw of matches) {
    const digits = raw.replace(/[^\d.]/g, '');
    if (!digits) continue;
    const plain = norm(digits);
    const significant = plain.replace('.', '').length >= 3 || /crore|cr\b|lakh|million|billion|%|[₹$]/i.test(raw);
    if (!significant) continue;
    if (/^(19|20)\d{2}$/.test(plain)) continue; // years
    if (!haystack.includes(plain)) unsourced.add(raw.trim());
  }
  return [...unsourced];
}

// LinkedIn renders no markdown. A post containing **bold** or *italics* publishes with the
// asterisks visible — observed 2026-08-25 on the first clean post ("**Brahmastra 2**").
// Strip emphasis, keep the words. Bullet markers at line start are left alone: those are
// real formatting the model uses deliberately.
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/gs, '$1')
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    // Italic: *word* preceded by start/space/open-bracket. The (?!\s) after the opening
    // asterisk is what protects real bullet lines ("* an item"), which never have a
    // non-space immediately after the marker.
    .replace(/(^|[\s(\[])\*(?!\s)([^*\n]+?)(?<!\s)\*(?=[\s.,;:!?)\]]|$)/gm, '$1$2')
    .replace(/(^|[\s(\[])_(?!\s)([^_\n]+?)(?<!\s)_(?=[\s.,;:!?)\]]|$)/gm, '$1$2')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1');
}

function inspect(text: string): string[] {
  const violations: string[] = [];
  const banned = findBannedPhrases(text);
  if (banned.length) violations.push(`banned phrase(s): ${banned.join(', ')}`);
  const questions = countQuestions(text);
  if (questions > MAX_QUESTIONS) violations.push(`${questions} questions (max ${MAX_QUESTIONS})`);
  return violations;
}

export async function enforceLinkedInQuality(
  client: Groq,
  text: string,
  storyContext: string,
): Promise<QualityResult> {
  const capped = capHashtags(stripMarkdown(text));

  // Unsourced figures are a HARD reject — no rewrite. A rewrite would just launder the
  // invented number into different wording; the only safe response is to publish nothing.
  if (storyContext) {
    const invented = findUnsourcedNumbers(capped, storyContext);
    if (invented.length > 0) {
      const v = [`unsourced figure(s) not present in the source: ${invented.join(', ')}`];
      console.error(`   ❌ Quality gate: ${v[0]} — REJECTED, not rewritten.`);
      return { text: capped, passed: false, violations: v, rewritten: false };
    }
  }

  const violations = inspect(capped);

  if (violations.length === 0) {
    return { text: capped, passed: true, violations: [], rewritten: false };
  }

  console.log(`   ⚠️  Quality gate: ${violations.join(' | ')} — requesting one rewrite...`);

  try {
    const model = (await resolveModels()).repair;
    const response = await client.chat.completions.create({
      // Cheap model on purpose: this is "remove a banned phrase, cut a question" — mechanical
      // repair, not writing. 70B is reserved for the post itself. Saves ~3-4k tokens per
      // retry against the 100k/day free-tier cap, and returns faster.
      model,
      ...reasoningParamsFor(model),
      max_completion_tokens: 900,
      messages: [
        { role: 'system', content: getLinkedInRetryVoiceContext() },
        {
          role: 'user',
          content: `This LinkedIn post is otherwise fine but breaks rules that are not negotiable:

${violations.map((v) => `- ${v}`).join('\n')}

${storyContext ? `GROUNDING — use only facts already established here:\n${storyContext}\n\n` : ''}CURRENT POST:
"""
${capped}
"""

Rewrite it so it breaks none of those rules, changing as little else as possible.

Where a banned phrase appears, do not swap in a synonym — the phrasing is banned because the THOUGHT is empty. "X is a testament to Y" and "X highlights the importance of Y" say nothing about X. Delete the sentence and replace it with a specific fact about this story, or cut it and let the surrounding lines carry the paragraph.

If there are too many questions, keep at most the single best one and turn the others into statements. A post that ends on a flat statement is stronger than one that asks the reader to do homework.

KEEP THE POST THE SAME LENGTH. It is currently ${capped.length} characters and your rewrite must be within about 100 characters of that. You are fixing specific violations, not editing it down — every paragraph that does not contain a violation should come back essentially unchanged. A shorter post will be discarded and the whole thing thrown away.

Output ONLY the rewritten post — no labels, no preamble, no quotes around it.`,
        },
      ],
    });

    const choice = response.choices[0];
    if (choice?.finish_reason === 'length') {
      console.warn('   ⚠️  Quality rewrite was truncated — discarding it.');
      return { text: capped, passed: false, violations, rewritten: true };
    }

    const rewritten = choice?.message?.content?.trim();
    if (!rewritten) {
      return { text: capped, passed: false, violations, rewritten: true };
    }

    // The repair model rewrites to fix a violation, not to re-length the post — but on
    // 2026-08-09 it took a 1,782-char post down to 962, undoing the expansion that had just
    // run and dropping it below the floor. A repair that guts the post is not a repair.
    if (rewritten.length < capped.length * 0.85) {
      console.warn(`   ⚠️  Rewrite shrank the post ${capped.length} → ${rewritten.length} chars — discarding it.`);
      return { text: capped, passed: false, violations, rewritten: true };
    }

    const finalText = capHashtags(rewritten);
    const remaining = inspect(finalText);

    if (remaining.length === 0) {
      console.log('   ✅ Quality gate: rewrite clean.');
      return { text: finalText, passed: true, violations: [], rewritten: true };
    }

    console.warn(`   ❌ Quality gate: still failing after rewrite — ${remaining.join(' | ')}`);
    return { text: finalText, passed: false, violations: remaining, rewritten: true };
  } catch (err) {
    console.warn('   ⚠️  Quality rewrite call failed:', err instanceof Error ? err.message : err);
    return { text: capped, passed: false, violations, rewritten: true };
  }
}
