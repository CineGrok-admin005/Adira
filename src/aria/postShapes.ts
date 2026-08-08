// Why this file exists.
//
// The prompts used to hand the model one fill-in-the-blank skeleton — hook / tension / what
// it changes / honest cost / one question / hashtags — spelled out paragraph by paragraph.
// A 70B model follows that literally, so every long post came out structurally identical no
// matter what the story was. The closing question was mandated in three separate places, so
// every post also ended the same way.
//
// These are arcs, not templates: a few lines of prose describing the movement of the post,
// deliberately under-specified so the model fills them differently each time. Each shape
// carries its OWN ending, which is what stops "one specific question at the end" from being
// a universal rule.
//
// Adding a shape: keep the brief to 2-4 sentences, avoid [bracket] slots (the model copies
// their wording), and state explicitly whether it ends on a question.

export interface PostShape {
  name: string;
  brief: string;
}

export const COMMENTARY_SHAPES: PostShape[] = [
  {
    name: 'person-first',
    brief: `Open on one specific person from the story, at the moment before anyone knew their name. Let the facts of what they did carry the weight — do not explain the lesson underneath them. Somewhere in the middle, say plainly what it cost to be that person. Close by asking one thing only a working filmmaker could answer.`,
  },
  {
    name: 'contrarian',
    brief: `Open by naming what everyone assumes about this corner of the industry, then use a concrete detail from the story to show the opposite is happening. Do not soften it or balance it. Close on a flat statement rather than a question — the sharpest one-line version of what just changed.`,
  },
  {
    name: 'flat-specifics',
    brief: `No throat-clearing and no framing sentence. Stack the concrete facts from the story — names, numbers, dates, decisions — in short declarative lines, and let the accumulation do the arguing. One line at the end reframes what that stack means for someone with nothing on their reel yet. No question anywhere.`,
  },
];

export const EXPLAINER_SHAPES: PostShape[] = [
  {
    name: 'numbered-breakdown',
    brief: `Name the technique in the first line, together with what it unlocks. Then three to five numbered pieces, each one immediately usable on a real shoot — a specific instruction, not a restated label. Close on what will look different the next time they shoot. No question.`,
  },
  {
    name: 'belief-correction',
    brief: `Open with what most beginners believe about this topic, then correct it with what is actually true. Spend the body on why the wrong version is so widespread and what it costs people who believe it. Close by asking what they were taught about this, and by whom.`,
  },
  {
    name: 'constraint-first',
    brief: `Start from the constraint this topic runs into — no budget, no crew, one location, one lens, whatever applies. Work forward until the technique arrives as the answer to that constraint rather than as a lesson being taught. Close on the single thing to try on the next shoot. No question.`,
  },
];

// Deterministic per IST day AND slot, for two reasons: the pre-warm run and the real run on
// the same day must agree (a cached image has to match the post it was generated for), and
// Commentary runs twice a day — hashing the date alone would give both slots the same shape.
export function pickShape(shapes: PostShape[]): PostShape {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const key = `${ist.toISOString().split('T')[0]}-${ist.getUTCHours()}`;
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return shapes[hash % shapes.length];
}
