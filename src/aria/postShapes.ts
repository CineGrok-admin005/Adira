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

// REPORTING shapes, not commentary shapes.
//
// The difference decides everything. Commentary reacts to a headline and tells the reader what
// it means for them — which is where "for emerging filmmakers, this signals a growing
// recognition of the importance of..." comes from. Reporting states what happened, adds what
// the reader didn't already know, and stops. ADIRA is not the best source on filmmaking craft
// and never will be; she can be the one who actually went and checked. Authority here comes
// from attention, not expertise.
//
// None of these shapes asks what the story means for the reader. That is the reader's job.
export const COMMENTARY_SHAPES: PostShape[] = [
  {
    name: 'straight-report',
    brief: `Report it flat. Who, what, where, when, how much — the concrete facts in plain declarative sentences, most important first. Include the numbers and names exactly as the sources give them. Add one piece of context a reader wouldn't already have: a comparison, a precedent, a figure that puts it in scale. Then stop. Do not interpret it, do not draw a lesson, do not address the reader.`,
  },
  {
    name: 'buried-detail',
    brief: `Every outlet led with the same headline. Lead with the thing they mentioned in passing and moved on from — the budget line, the runtime, the fact that it was shot in 19 days, the name nobody recognised. Say why that detail is the more interesting fact, using only what the sources actually report. End on the detail itself, not on advice.`,
  },
  {
    name: 'checked-it',
    brief: `Report what the sources actually agree on, and say plainly where they don't. If two outlets give different numbers, give both and name them. If a claim appears everywhere but traces to one press release, say that. This is the shape where being careful IS the value — you are not the expert, you are the one who checked. End when the checking ends.`,
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
