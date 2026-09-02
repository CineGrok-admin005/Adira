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

// Hashtags are the one rule the model was explicitly told NOT to think about — the character
// card says count is "enforced mechanically after you write". But capHashtags only ever
// removed extras; nothing ever added any. So the model dutifully spent no attention on them
// and the 2026-09-03 draft published with zero, on a platform where the tag is most of the
// non-follower reach. An instruction to ignore a rule is only safe if the mechanism actually
// enforces both sides of it, so this is the missing half.
//
// Conservative by design: tags come from proper nouns that are already in the source, never
// invented, and #CineGrok backfills the remainder. A wrong hashtag is a factual claim about
// what a post is about, so a generic-but-true tag beats a specific-but-guessed one.
const TAG_STOPWORDS = new Set([
  'the', 'this', 'that', 'a', 'an', 'and', 'but', 'his', 'her', 'their', 'its', 'it',
  'in', 'on', 'at', 'to', 'for', 'of', 'by', 'with', 'from', 'after', 'before',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'india', 'indian', 'new', 'first', 'read', 'also', 'watch', 'here', 'what', 'why', 'how',
]);

const ROLE_WORDS = new Set([
  'director', 'actor', 'actress', 'producer', 'filmmaker', 'writer', 'editor', 'composer',
  'cinematographer', 'star', 'singer', 'journalist', 'actor', 'critic', 'chief', 'president', 'ceo', 'founder', 'said', 'says',
]);

export function extractProperNounTags(source: string, limit: number): string[] {
  const counts = new Map<string, number>();

  // Capitalised runs of 1-3 words: "Sahiya", "High Court", "Central Board of Film".
  for (const m of source.matchAll(/\b([A-Z][a-z]{2,})(?:\s+([A-Z][a-z]{2,})){0,2}\b/g)) {
    const phrase = m[0].trim();
    let words = phrase.split(/\s+/);
    // "Director Sanjay Sharma" is captured whole because the role word is capitalised at the
    // start of a sentence. The role is not part of the name, so trim it from either end.
    while (words.length > 1 && ROLE_WORDS.has(words[0].toLowerCase())) words = words.slice(1);
    while (words.length > 1 && ROLE_WORDS.has(words[words.length - 1].toLowerCase())) words = words.slice(0, -1);
    // A single word that is a stopword (usually just a sentence opener) is not a proper noun.
    if (words.every((w) => TAG_STOPWORDS.has(w.toLowerCase()))) continue;
    if (words.length === 1 && TAG_STOPWORDS.has(words[0].toLowerCase())) continue;
    // A bare role is not a subject: #Journalist says nothing about which story this is.
    if (words.length === 1 && ROLE_WORDS.has(words[0].toLowerCase())) continue;
    const tag = '#' + words.join('');
    if (tag.length > 30) continue;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  // Drop a tag that is wholly contained in a longer one: "Sharma" occurs more often than
  // "Sanjay Sharma" (every later reference uses the surname alone), so a frequency-first sort
  // picks #Sharma — a tag that names half a person. The fuller form is always the better tag.
  const all = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const bare = (t: string) => t.slice(1).toLowerCase();
  const kept = all.filter(([tag]) =>
    !all.some(([other]) => other !== tag && bare(other).includes(bare(tag))),
  );

  return kept.slice(0, limit).map(([tag]) => tag);
}

// Guarantees exactly MAX_HASHTAGS tags: caps if there are too many, backfills if too few.
export function ensureHashtags(text: string, source: string, max = MAX_HASHTAGS): string {
  const capped = capHashtags(text, max);
  const present = capped.match(/#\w+/g) ?? [];
  if (present.length >= max) return capped;

  const have = new Set(present.map((t) => t.toLowerCase()));
  const additions: string[] = [];

  // Prefer nouns the POST is about over nouns the article merely mentions. Observed
  // 2026-09-03: a post about a Prime Video cast announcement was tagged #RadhikaGupta —
  // a name that appears once in the source article and never in the post. The tag was
  // truthfully sourced and still wrong, because a hashtag is a claim about what the reader
  // is about to read. So: source-grounded AND post-present first, source-only second.
  const inPost = (tag: string) => text.toLowerCase().includes(tag.slice(1).toLowerCase());
  const fromSource = extractProperNounTags(source, max * 6);
  const ranked = [...fromSource.filter(inPost), ...fromSource.filter((t) => !inPost(t)), '#CineGrok'];

  for (const tag of ranked) {
    if (additions.length + present.length >= max) break;
    if (have.has(tag.toLowerCase())) continue;
    have.add(tag.toLowerCase());
    additions.push(tag);
  }
  if (additions.length === 0) return capped;

  // Append to the existing tag line when there is one, otherwise start a new one.
  const lines = capped.split('\n');
  const lastIdx = lines.length - 1;
  if (present.length > 0 && /#\w+/.test(lines[lastIdx])) {
    lines[lastIdx] = `${lines[lastIdx].trim()} ${additions.join(' ')}`;
    return lines.join('\n');
  }
  return `${capped}\n\n${additions.join(' ')}`;
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
    // Years were exempted here to keep the gate quiet. That exemption is what let the
    // 2026-09-03 draft assert "the 2018 'Udta Punjab' controversy, where the board's vague
    // objections led to a Supreme Court ruling" — a sentence in which the year is wrong (2016)
    // and the court is wrong (Bombay High Court), pulled from the model's own memory rather
    // than the article. A historical year is a factual claim like any other, and it usually
    // arrives welded to the rest of a half-remembered fact, so checking it catches more than
    // itself. Only the current year is exempt: a post may legitimately date itself.
    if (plain === String(new Date().getFullYear())) continue;
    if (!haystack.includes(plain)) unsourced.add(raw.trim());
  }
  return [...unsourced];
}

// Every direct quote in the post must appear in the source text.
//
// This is the more dangerous sibling of findUnsourcedNumbers. Once posts got long enough to
// carry real reporting (2026-09-03), they started attributing direct quotes to named people
// — and nothing checked them. A fabricated quote put in the mouth of a real person who is
// currently in litigation is materially worse than a wrong number: it is defamation risk,
// not just an error.
//
// Only spans of QUOTE_MIN_CHARS or more are checked. Shorter quoted spans are film titles
// ("Sahiya"), section names, or single words — not claimed utterances.
//
// Matching is deliberately strict: normalised, but substring-exact. A quote that has been
// smoothed, merged, or extended is not the same quote, and "close enough" is exactly the
// failure we are trying to catch.
const QUOTE_MIN_CHARS = 25;

function normaliseForQuoteMatch(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")   // curly quotes -> straight
    .replace(/[\u2010-\u2015]/g, '-')                // dashes -> hyphen
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export function findUnsourcedQuotes(post: string, source: string): string[] {
  const haystack = normaliseForQuoteMatch(source);
  const unsourced: string[] = [];

  // Curly and straight double quotes, via explicit escapes. Written literally, the curly
  // characters do not survive round-tripping through tooling and the class silently matches
  // nothing — which is exactly what happened on the first attempt: the gate detected zero
  // spans and passed everything, while a test that only asserted "allowed" scored it green.
  const OPEN = "\\u201C";
  const CLOSE = "\\u201D";
  const pattern = new RegExp(
    `[${OPEN}"]([^${OPEN}${CLOSE}"\\n]{4,400})[${CLOSE}"]`,
    'g',
  );

  for (const m of post.matchAll(pattern)) {
    const inner = (m[1] ?? "").trim();
    if (inner.length < QUOTE_MIN_CHARS) continue;
    if (!haystack.includes(normaliseForQuoteMatch(inner))) {
      unsourced.push(inner.length > 90 ? inner.slice(0, 90) + '...' : inner);
    }
  }
  return unsourced;
}

// Exposed so tests can distinguish "allowed because verified" from "allowed because the
// regex matched nothing" — the false-pass that hid the broken character class.
// ADIRA never interviews anyone. She reads what other outlets reported.
//
// Observed 2026-09-03: a post opened "Sanjay Sharma ... told me today that his independent
// drama Sahiya has been stuck ..." — asserting a phone call with a named person who is
// currently in a legal dispute with a government body. Nothing in the pipeline objected,
// because the words themselves were unremarkable; it is the CLAIM OF ACCESS that is false.
//
// This is worse than a misquote. A misquote garbles something real; this invents the act of
// reporting itself, and it is the kind of thing that gets a publication sued rather than
// corrected. Hard reject, like fabricated quotes — a rewrite would just relocate the claim.
//
// Attribution to the OUTLET ("Movietalkies reported", "according to The Hindu") is correct
// and must keep working, so the patterns below only match first-person access claims.
const FIRSTHAND_CLAIMS: { label: string; re: RegExp }[] = [
  { label: 'told me / told us', re: /\btold (me|us)\b/i },
  { label: 'said to me / us', re: /\bsaid to (me|us)\b/i },
  { label: 'confirmed to me / us', re: /\bconfirm(ed|s) to (me|us)\b/i },
  { label: 'spoke to me / us', re: /\bspoke (to|with) (me|us)\b/i },
  { label: 'I spoke to / with', re: /\bI spoke (to|with)\b/i },
  { label: 'I asked / interviewed', re: /\bI (asked|interviewed|reached out to|contacted)\b/i },
  { label: 'in an interview with me/us', re: /\bin an interview with (me|us)\b/i },
  { label: 'when I met', re: /\bwhen I (met|visited|sat down with)\b/i },
  { label: 'our conversation', re: /\bour (conversation|interview|call) with\b/i },
  { label: 'CineGrok has learned', re: /\b(CineGrok|we) (has|have) (learned|learnt|confirmed)\b/i },
];

// Specific calendar dates in the post must appear in the source.
//
// Observed 2026-09-03: the source said a director "is prepared to approach the High Court if
// the matter is not resolved soon" — a conditional threat. The post reported that he "lodged
// a High Court petition on September 2": a completed legal filing, on a date the article
// never mentions. Neither existing gate caught it. "September 2" is too short for the number
// check (which ignores anything under 3 digits, so years and small counts do not spam it),
// and it is not a quote.
//
// A date is the load-bearing part of that sentence — it is what turns "may sue" into "has
// sued". Checking dates does not catch every fabricated event, but it catches the ones that
// assert something happened at a specific moment, which is the dangerous shape.
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';

export function findUnsourcedDates(post: string, source: string): string[] {
  const norm = (s: string) => s.replace(/[,]/g, '').replace(/\s+/g, ' ').toLowerCase();
  const haystack = norm(source);
  const found = new Set<string>();

  // "September 2", "2 September", "Sept 2nd" — with or without an ordinal suffix.
  //
  // Built with String.raw, not string concatenation. In an ordinary JS string literal `'\b'`
  // is a backspace character rather than a word boundary, and `'\s'` / `'\d'` collapse to bare
  // "s" / "d" — a regex assembled that way matches nothing, and a gate that matches nothing
  // reports every post as clean. That is the same silent-pass the quote gate shipped with;
  // the unit tests below assert on found spans precisely so it cannot happen again unseen.
  const re = new RegExp(
    String.raw`\b(?:(${MONTHS})\s+(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTHS}))\b`,
    'gi',
  );

  for (const m of post.matchAll(re)) {
    const phrase = m[0].trim();
    if (!haystack.includes(norm(phrase))) {
      // Also accept the reversed form ("2 September" vs "September 2") before flagging.
      const month = (m[1] || m[4] || '').toLowerCase();
      const day = (m[2] || m[3] || '');
      const reversed = norm(day + ' ' + month);
      const forward = norm(month + ' ' + day);
      if (!haystack.includes(reversed) && !haystack.includes(forward)) found.add(phrase);
    }
  }
  return [...found];
}


export function findFirsthandClaims(post: string): string[] {
  return FIRSTHAND_CLAIMS.filter((p) => p.re.test(post)).map((p) => p.label);
}


export function countQuoteSpans(post: string): number {
  const OPEN = "\\u201C";
  const CLOSE = "\\u201D";
  const pattern = new RegExp(
    `[${OPEN}"]([^${OPEN}${CLOSE}"\\n]{4,400})[${CLOSE}"]`,
    'g',
  );
  let n = 0;
  for (const m of post.matchAll(pattern)) {
    if ((m[1] ?? "").trim().length >= QUOTE_MIN_CHARS) n++;
  }
  return n;
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
    .replace(/(^|[\s(\[\u2012-\u2015-])\*(?!\s)([^*\n]+?)(?<!\s)\*(?=[\s.,;:!?)\]\u2012-\u2015-]|$)/gm, '$1$2')
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
  const capped = ensureHashtags(stripMarkdown(text), storyContext);

  // Unsourced figures and quotes are HARD rejects — no rewrite. A rewrite would only
  // launder invented content into different wording; the safe response is to publish
  // nothing. Quotes are checked first because they carry the greater risk: a fabricated
  // number is an error, a fabricated quote attributed to a named person is defamation.
  // Fabricated first-hand sourcing is a hard reject and needs no source text to detect —
  // ADIRA has no reporters and conducts no interviews, so any claim of direct access is
  // false by construction.
  const firsthand = findFirsthandClaims(capped);
  if (firsthand.length > 0) {
    const v = [`fabricated first-hand sourcing: ${firsthand.join(', ')} — ADIRA does not interview anyone`];
    console.error(`   ❌ Quality gate: ${v[0]} — REJECTED, not rewritten.`);
    return { text: capped, passed: false, violations: v, rewritten: false };
  }

  if (storyContext) {
    const madeUpQuotes = findUnsourcedQuotes(capped, storyContext);
    if (madeUpQuotes.length > 0) {
      const v = [`quote(s) not found in the source: ${madeUpQuotes.map((q) => `"${q}"`).join(' | ')}`];
      console.error(`   ❌ Quality gate: ${v[0]} — REJECTED, not rewritten.`);
      return { text: capped, passed: false, violations: v, rewritten: false };
    }

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

    const finalText = ensureHashtags(rewritten, storyContext);
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
