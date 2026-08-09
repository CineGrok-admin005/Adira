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
  const capped = capHashtags(text);
  const violations = inspect(capped);

  if (violations.length === 0) {
    return { text: capped, passed: true, violations: [], rewritten: false };
  }

  console.log(`   ⚠️  Quality gate: ${violations.join(' | ')} — requesting one rewrite...`);

  try {
    const response = await client.chat.completions.create({
      // Cheap model on purpose: this is "remove a banned phrase, cut a question" — mechanical
      // repair, not writing. 70B is reserved for the post itself. Saves ~3-4k tokens per
      // retry against the 100k/day free-tier cap, and returns faster.
      model: 'llama-3.1-8b-instant',
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
