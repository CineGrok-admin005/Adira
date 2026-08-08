import Groq from 'groq-sdk';
import { getLinkedInRetryVoiceContext } from './characterCard';

export type LinkedInLengthTarget = 'SHORT' | 'LONG' | 'UNKNOWN';

export interface LinkedInLengthResult {
  text: string;
  declaredTarget: LinkedInLengthTarget;
  originalLength: number;
  finalLength: number;
  retried: boolean;
}

// Below this, a post that declared LONG gets one expansion retry.
//
// This was 900 while the target stated everywhere else — including in the retry prompt below
// — is 1,300-2,000. That 400-character dead zone was real: on 2026-08-08 drafts landed at
// 921 and 998 chars, declared LONG, and sailed past the threshold to publish thin. The whole
// point of the LONG/SHORT declaration is that the model commits to a depth and then hits it;
// 900 let it declare LONG and deliver SHORT. Set just under the target band so a genuine
// near-miss (1,250+) ships as-is and only real shortfalls pay for a second call.
const LONG_MIN_CHARS = 1250;

// The model does not reliably emit its length declaration as the bracketed [LINKEDIN_LENGTH]
// tag immediately after [LINKEDIN]. Observed 2026-08-07: the Explainer wrote a bare
// "LENGTH: LONG" as the first line of the post instead. Unbracketed, it slipped past the
// bracket-tag stripper and became the above-the-fold hook — the ~210 characters that decide
// most of a LinkedIn post's reach. So: accept every form when reading it, and strip every
// form from the body. Reading it wrong also matters — a missed SHORT declaration makes
// expandLinkedInIfShort force-expand a post that was deliberately short.
const LENGTH_DECLARATION_SOURCE = String.raw`\[?\s*(?:LINKEDIN_)?LENGTH\s*:\s*(SHORT|LONG)\s*\]?`;

export function parseLinkedInLengthTag(sectionText: string): LinkedInLengthTarget {
  const m = sectionText.match(new RegExp(LENGTH_DECLARATION_SOURCE, 'i'));
  return m ? (m[1].toUpperCase() as LinkedInLengthTarget) : 'UNKNOWN';
}

// Removes a length declaration that leaked onto its own line in the post body.
// Line-anchored so it can never eat prose that merely contains the word "length".
export function stripLengthDeclaration(body: string): string {
  return body
    .replace(new RegExp(`^[ \\t]*${LENGTH_DECLARATION_SOURCE}[ \\t]*$`, 'gim'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Single-retry expansion. Never throws — any failure (including a 429 from
// Groq's free-tier TPM cap) falls back to the original text unchanged.
export async function expandLinkedInIfShort(
  client: Groq,
  currentText: string,
  declaredTarget: LinkedInLengthTarget,
  storyContext: string,
): Promise<LinkedInLengthResult> {
  const originalLength = currentText.length;
  const needsExpansion = originalLength < LONG_MIN_CHARS && declaredTarget !== 'SHORT';

  if (!needsExpansion) {
    return { text: currentText, declaredTarget, originalLength, finalLength: originalLength, retried: false };
  }

  console.log(`   ⚠️  LinkedIn draft is ${originalLength} chars (declared ${declaredTarget === 'UNKNOWN' ? 'no length tag' : declaredTarget}) — retrying with an expansion request...`);

  try {
    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_completion_tokens: 700,
      messages: [
        { role: 'system', content: getLinkedInRetryVoiceContext() },
        { role: 'user', content: `Here is a LinkedIn post you just wrote. It's meant to be LONG (1,300-2,000 characters) but only came out to ${originalLength} characters — too thin.

${storyContext ? `GROUNDING — only use facts already established here, never invent new ones:\n${storyContext}\n\n` : ''}CURRENT DRAFT:
"""
${currentText}
"""

Rewrite it, keeping the same hook and voice, but go deeper: add the tension under the surface, and/or what this changes for someone still becoming, and/or the honest cost — using only facts already in the draft or the grounding above. Do not invent new names, numbers, or events. Do not write the scaffolding out loud ("the real tension is", "this changes one thing"). Short paragraphs, one idea.

Keep the draft's existing ending. If it ends on a question, keep that question. If it ends on a statement, keep a statement — do NOT add a question. The draft's closing line was chosen deliberately.

Output ONLY the rewritten post text — no labels, no preamble, no quotes around it.` },
      ],
    });

    const choice = response.choices[0];
    if (choice?.finish_reason === 'length') {
      console.warn('   ⚠️  LinkedIn retry itself got truncated (finish_reason=length).');
    }
    const expanded = choice?.message?.content?.trim();
    if (expanded && expanded.length > originalLength) {
      return { text: expanded, declaredTarget, originalLength, finalLength: expanded.length, retried: true };
    }
    console.warn('   ⚠️  Retry did not produce a longer post — keeping the original.');
    return { text: currentText, declaredTarget, originalLength, finalLength: originalLength, retried: true };
  } catch (err) {
    console.warn('   ⚠️  LinkedIn length retry failed (keeping original):', err instanceof Error ? err.message : err);
    return { text: currentText, declaredTarget, originalLength, finalLength: originalLength, retried: true };
  }
}
