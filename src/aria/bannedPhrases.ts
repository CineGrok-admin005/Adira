// Banned phrases, enforced in code — not in the prompt.
//
// characterCard.ts has said "You do not say: ... journey ..." since the beginning, and
// "journey" still appears in the posts the founder flagged as failures. A prose ban is a
// suggestion to a 70B model; the same lesson already forced the news SKIP rules out of the
// prompt and into rankStories.ts. So this list is checked against the finished text, and a
// post that trips it gets one targeted rewrite before it is rejected outright.
//
// Phrase-level where a bare word would over-trigger: "reminder" is fine in ordinary use,
// "is a reminder that" is the moralising tic we're killing.

export const BANNED_PATTERNS: { label: string; re: RegExp }[] = [
  // Corporate-announcement register (the original characterCard list)
  { label: 'thrilled', re: /\bthrilled\b/i },
  { label: 'excited', re: /\bexcited\b/i },
  { label: 'proud to announce', re: /\bproud to announce\b/i },
  { label: 'delighted', re: /\bdelighted\b/i },
  { label: 'humbled', re: /\bhumbled\b/i },
  { label: 'ecosystem', re: /\becosystem\b/i },
  { label: 'game-changer', re: /\bgame[- ]?chang(er|ing)\b/i },
  { label: 'leverage', re: /\bleverag(e|ing)\b/i },
  { label: 'synergy', re: /\bsynerg(y|ies)\b/i },
  { label: 'incredible', re: /\bincredible\b/i },
  { label: 'amazing', re: /\bamazing\b/i },
  { label: 'passionate community', re: /\bpassionate community\b/i },

  // The moralising tics — every one of these appears in the flagged posts
  { label: 'journey', re: /\bjourney\b/i },
  { label: 'is a reminder', re: /\b(is|serves as) a reminder\b/i },
  { label: 'marking another step', re: /\bmarking another step\b/i },
  { label: 'growing trend', re: /\bgrowing trend\b/i },
  { label: "it's crucial", re: /\bit('|’)?s crucial\b/i },
  { label: 'what can you learn', re: /\bwhat can (you|we) learn\b/i },
  { label: 'take note', re: /\btake note\b/i },
  { label: 'in/evolving landscape', re: /\b(in today('|’)?s|evolving|changing) landscape\b/i },
  { label: 'testament', re: /\btestament\b/i },
  { label: 'highlights the importance', re: /\bhighlights? the (importance|need)\b/i },
  { label: 'underscores the importance', re: /\bunderscores? the (importance|growing)\b/i },
  { label: 'sheds light on', re: /\bsheds light on\b/i },
  { label: 'in a candid conversation', re: /\bin a candid conversation\b/i },
  { label: 'carved a niche', re: /\bcarved (out )?a niche\b/i },
  { label: 'signals a growing recognition', re: /\bsignals? a growing recognition\b/i },
];

export function findBannedPhrases(text: string): string[] {
  return BANNED_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

// Counts real question marks. The brief allows at most one per post, and only when the
// answer is genuinely unknown — the "hand the reader homework" ending is the single most
// visible tell across every failing post.
export function countQuestions(text: string): number {
  return (text.match(/\?/g) || []).length;
}

export function countHashtags(text: string): number {
  return (text.match(/#\w+/g) || []).length;
}
