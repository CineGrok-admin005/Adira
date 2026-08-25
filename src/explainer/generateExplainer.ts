import { resolveModels } from '../llm/models';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

import { ADIRA_SYSTEM_PROMPT } from '../aria/characterCard';
import { expandLinkedInIfShort, parseLinkedInLengthTag, stripLengthDeclaration } from '../aria/linkedinLength';
import { enforceLinkedInQuality } from '../aria/qualityGate';
import { readMemory, writeMemory, formatMemoryContext } from '../aria/memory';
import { getAudienceMode, audienceContext } from '../aria/audience';
import { EXPLAINER_SHAPES, pickShape, type PostShape } from '../aria/postShapes';
import { ExplainerPillar, ExplainerPost, EmotionState } from '../types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PILLAR_LABEL: Record<ExplainerPillar, string> = {
  CRAFT_BREAKDOWN: 'CRAFT BREAKDOWN',
  EDUCATIONAL_FRAMEWORK: 'EDUCATIONAL FRAMEWORK',
  TOOLS_AND_RESOURCES: 'TOOLS AND RESOURCES',
};

// `shapeOverride`: see the note on generateCommentary — test seam only, never used in production.
export async function generateExplainer(seed: { pillar: ExplainerPillar; topic: string }, shapeOverride?: PostShape): Promise<ExplainerPost> {
  const memory = await readMemory();
  const audience = getAudienceMode();
  const pillarLabel = PILLAR_LABEL[seed.pillar];
  const shape = shapeOverride ?? pickShape(EXPLAINER_SHAPES);
  console.log(`   Post shape: ${shape.name}`);

  const prompt = `${audienceContext(audience)}

## YOUR MEMORY (recent posts — do not repeat these tones or openings)
${formatMemoryContext(memory)}

## TODAY'S ASSIGNMENT
Pillar: ${pillarLabel}
Topic: ${seed.topic}

Write this as that pillar, on this exact topic. Do not write about anything else and do not switch pillars mid-post.

## GROUNDING — THE MOST IMPORTANT RULE
Only state a specific film, person's name, number, price, or spec if it is already in the topic above or is extremely common knowledge (e.g. "24fps", "the rule of thirds"). When you're not certain of a specific fact, speak in general technique terms instead of inventing a name, number, or price. Inventing a specific-sounding fact is the failure mode here — vague-but-true beats specific-but-wrong.

## WHAT ADIRA SOUNDS LIKE — study the SHAPE, never copy the facts
⚠️ These illustrate TONE and STRUCTURE only — fill the shape with today's actual topic.

BAD (do not write like this):
"Lighting is one of the most important tools a filmmaker has. Understanding how to use it well can make a huge difference in your final product."
→ A blog post. Generic. Says nothing anyone could act on.

GOOD is not a template — it is a set of tests your draft has to pass:
→ It names the technique or tool plainly, in the first line, without a wind-up.
→ Every piece of the breakdown is something a filmmaker could act on tomorrow, not a restated label.
→ A reader who already knew the term still finds one thing in it they hadn't considered.
→ Nothing in it would survive being pasted under a different topic.

## YOUR TASK
Write in ADIRA's voice — specific, opinionated, teaching something a filmmaker with no budget and no crew can actually use tomorrow.

Format EXACTLY:

[LINKEDIN]
[LINKEDIN_LENGTH: SHORT or LONG — state which one you're about to write, then hit that target for real]

This is ${pillarLabel} — it must read as SCANNABLE and STRUCTURED, not as a narrative essay. Use short paragraphs and, where it fits the topic, a numbered or bulleted breakdown — this content class earns saves and shares by being immediately usable, not by unfolding a story.

DECIDE THE LENGTH FROM THE TOPIC, AND COMMIT TO IT:
- If it's one clean, sharp technique or fact — declare SHORT and write 300-600 chars. Don't pad it.
- If there's a real breakdown to walk through (a framework, a comparison, several steps) — declare LONG and write 1,300-2,000 chars using the LONG-FORM skeleton below as your floor, not your ceiling.
- When in doubt, declare LONG. A thin 3-4 sentence post is the thing that gets scrolled past.

THE FIRST LINE (above the ~210-char "see more" fold) decides ~80% of reach. Open with ONE of:
- the technique/tool/framework named plainly, with the promise of what it unlocks, or
- a contrarian line (the thing most people assume vs. what's actually true), or
- one concrete, checkable fact stated flat.
Never open with a preamble or a question.

⛔ NEVER write the scaffolding out loud. Do not write phrases like "here's the framework", "let's break it down", "the key takeaway is". Those name the structure — they are not sentences. Write the actual specific thing instead.

TODAY'S SHAPE — "${shape.name}". This is the arc of the post, not wording to copy:
${shape.brief}

Follow that arc, including how it ends. If the shape closes on a statement, do not tack a question on anyway. If it closes on a question, ask exactly one, as the final line before the hashtags, and make it something only a working filmmaker could answer — never "thoughts?" or engagement bait.

FORMAT: short paragraphs, white space, scannable on a phone. First-person, human, a real point of view. Do NOT put any link or URL in the body — the link goes in the first comment. Hashtags (2-3): #CineGrok + 1-2 specific topic tags.

Having declared LONG, write 1,300-2,000 characters, with the breakdown carrying the bulk of it. If the topic is genuinely one clean point, declare SHORT instead and write 300-600 characters rather than padding it out. Put that declaration in the length tag at the top of this section, never in the post text itself.

End on your hashtags; the "— ADIRA, CineGrok" byline is added for you.

[TWEET_BRIEF]
Do NOT write a tweet. Write a short brief that the CineGrok Tweets project (Claude) will turn into the actual tweet. Keep it to these three lines:
TOPIC: [what it is, one line]
WHY IT MATTERS: [what it unlocks for a no-budget filmmaker — one line]
ANGLE: [the sharpest CineGrok-specific take, or the misconception it corrects]

[TONE]
One word: e.g. Direct, Sharp, Warm, Dry, Instructive

[EMOTION]
Pick one: excited / thoughtful / reporting / serious / warm

[IMAGE_PROMPT]
ADIRA must look mid-explanation, not posing — like she's genuinely walking someone through this.

Choose EXPRESSION based on EMOTION:
- excited → eyes: sparkling wide, brows: raised high, mouth: broad genuine smile, posture: leaning forward, hands: open gesturing
- thoughtful → eyes: soft focused sideways, brows: slightly furrowed, mouth: pressed in consideration, posture: hand to chin
- reporting → eyes: direct and interested, brows: engaged, mouth: slight smile mid-sentence, posture: upright, hands: notepad or mic
- serious → eyes: intense gaze direct to camera, brows: furrowed gravitas, mouth: pressed determined, posture: rigid upright
- warm → eyes: crinkled soft smile, brows: relaxed, mouth: genuine warm smile, posture: open relaxed

POST CATEGORY: Educational / Craft Breakdown
WHAT HAPPENED: [one sentence describing the topic being explained]
WHY THIS MATTERS: [what it unlocks for emerging filmmakers]
SHOULD ADIRA BE IN THIS?
  Write "No" when a concept/tool visual teaches the point better on its own — e.g. a lighting rig, a lens comparison flat-lay, an edit-suite monitor with a framing grid, a clapperboard.
  Write "Yes" when ADIRA physically demonstrating or gesturing through the explanation is the stronger image.
  Rule of thumb: if the image would teach MORE by showing the technique/tool itself rather than the reporter — write No.
ADIRA'S ROLE: [Teaching / Demonstrating / Observing]
SCENE: [if Yes: specific location for ADIRA. If No: describe the concept visual]
ACTION: [if Yes: active verb describing ADIRA. If No: describe the visual's action/composition]
EXPRESSION: [if Yes: full face/body description. If No: write "N/A — concept image"]
WARDROBE: [if Yes: specific clothing. If No: write "N/A"]
PROPS: [if Yes: press lanyard "ADIRA / CineGrok" + items relevant to the topic. If No: props relevant to the concept]
LIGHTING: [specific lighting mood regardless]
MOOD: [one word]
SPEECH BUBBLE: [one punchy sentence — if Yes: what ADIRA says. If No: a short quote that could appear as a text overlay]

[IMAGE_STYLE]
One of: Cinematic / Moody / Surreal

[INSTAGRAM_BRIEF]
Write a brief for Claude to generate a high-quality Instagram carousel. Format EXACTLY as shown (do not include a PILLAR line — that's added separately):

CORE STORY IN ONE LINE: [the single sharpest teaching point from this topic]

KEY DATA POINTS:
- [2-3 concrete, usable specifics from this topic]

EMOTIONAL ANGLE: [felt seen / learned something / want to act / surprised]

SUGGESTED HOOK FOR SLIDE 1: [one sharp specific opening line]`;

  const response = await groq.chat.completions.create({
    model: (await resolveModels()).writer,
    max_completion_tokens: 3000,
    messages: [
      { role: 'system', content: ADIRA_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });
  console.log(`   🔢 Groq usage: ${response.usage?.total_tokens ?? '?'} tokens (prompt ${response.usage?.prompt_tokens ?? '?'} / completion ${response.usage?.completion_tokens ?? '?'}), finish_reason=${response.choices[0]?.finish_reason}`);

  const text = response.choices[0]?.message?.content ?? '';

  // Observed 2026-08-07: the model sometimes skips the [LINKEDIN] header and opens the
  // section with [LINKEDIN_LENGTH: ...] instead. Anchoring only on [LINKEDIN] threw away an
  // otherwise perfectly good post. Accept either as the section opener; stripLengthDeclaration
  // below removes whichever tag ends up inside the body.
  const linkedinMatch       = text.match(/\[LINKEDIN(?:_LENGTH)?[^\]]*\]\s*(?:\[LINKEDIN_LENGTH:[^\]]*\]\s*)?([\s\S]*?)(?=\[TWEET_BRIEF\])/);
  // Read the declaration from the whole response, in any form the model emits it.
  const declaredLengthTag = parseLinkedInLengthTag(text);
  const tweetBriefMatch     = text.match(/\[TWEET_BRIEF\]\s*([\s\S]*?)(?=\[TONE\])/);
  const toneMatch           = text.match(/\[TONE\]\s*([\s\S]*?)(?=\[EMOTION\]|\[IMAGE_PROMPT\])/);
  const emotionMatch        = text.match(/\[EMOTION\]\s*(excited|thoughtful|reporting|serious|warm)/i);
  const imagePromptMatch    = text.match(/\[IMAGE_PROMPT\]\s*([\s\S]*?)(?=\[IMAGE_STYLE\])/);
  const imageStyleMatch     = text.match(/\[IMAGE_STYLE\]\s*(Cinematic|Moody|Surreal)/);
  const instagramBriefMatch = text.match(/\[INSTAGRAM_BRIEF\]\s*([\s\S]*?)$/);

  const SIG_LI = '\n\n— ADIRA, CineGrok'; // LinkedIn down-ranks outbound links — link goes in first comment, not the body
  const stripTags = (t: string) => (t ?? '').replace(/\[[A-Z][A-Z_ ]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const addSigLi = (t: string) => t.includes('— ADIRA, CineGrok') ? t : t + SIG_LI;

  if (!linkedinMatch?.[1]) {
    throw new Error('generateExplainer: failed to parse LinkedIn post from response');
  }

  let linkedinBody = stripLengthDeclaration(stripTags(linkedinMatch[1]))
    .replace(/https?:\/\/(www\.)?cinegrok\.in\/?\S*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const declaredLength = declaredLengthTag;

  const lengthResult = await expandLinkedInIfShort(groq, linkedinBody, declaredLength, seed.topic);
  linkedinBody = lengthResult.text;
  console.log(`   💼 LinkedIn: ${lengthResult.originalLength} chars (declared ${lengthResult.declaredTarget})${lengthResult.retried ? ` → retried → ${lengthResult.finalLength} chars` : ''}`);

  // See generateCommentary: enforced in code because the prompt-level ban demonstrably fails.
  const quality = await enforceLinkedInQuality(groq, linkedinBody, seed.topic);
  linkedinBody = quality.text;
  if (!quality.passed) {
    throw new Error(`generateExplainer: quality gate rejected the post — ${quality.violations.join(' | ')}`);
  }

  const linkedin = addSigLi(linkedinBody);
  const tweetBrief = (tweetBriefMatch?.[1] ?? '').replace(/\n{3,}/g, '\n\n').trim();

  // See the note in generateCommentary: the model echoes the "One word:" label into the
  // value. Observed 2026-08-08 — every explainer memory row read "One word: Instructive".
  const tone = (toneMatch?.[1] ?? '')
    .replace(/^\s*one word\s*:\s*/i, '')
    .split('\n')[0]
    .trim() || 'Instructive';
  const validEmotions = ['excited', 'thoughtful', 'reporting', 'serious', 'warm'] as const;
  const rawEmotion = emotionMatch?.[1]?.toLowerCase().trim() ?? 'thoughtful';
  const emotion = (validEmotions.includes(rawEmotion as typeof validEmotions[number]) ? rawEmotion : 'thoughtful') as EmotionState;

  // PILLAR line is set programmatically (never parsed from the model) so the external carousel
  // project sees the exact same "PILLAR: X" contract it already expects from Type 1/2 output.
  const instagramBriefBody = instagramBriefMatch?.[1]?.trim();
  const instagramBrief = instagramBriefBody ? `PILLAR: ${pillarLabel}\n\n${instagramBriefBody}` : undefined;

  const today = new Date().toISOString().split('T')[0];
  const openingLine = linkedin.split('\n')[0].slice(0, 80);

  await Promise.all([
    writeMemory('instagram', { date: today, milestoneType: `EXPLAINER_${seed.pillar}`, audience, toneUsed: tone, openingLine }),
    writeMemory('linkedin',  { date: today, milestoneType: `EXPLAINER_${seed.pillar}`, audience, toneUsed: tone, openingLine }),
    writeMemory('twitter',   { date: today, milestoneType: `EXPLAINER_${seed.pillar}`, audience, toneUsed: tone, openingLine }),
  ]);

  return {
    linkedin,
    tweetBrief,
    pillar: seed.pillar,
    topic: seed.topic,
    imagePrompt: imagePromptMatch?.[1]?.trim() ?? 'A filmmaker examining camera gear on a table, warm single light source',
    imageStyle: (imageStyleMatch?.[1] as 'Cinematic' | 'Moody' | 'Surreal') ?? 'Cinematic',
    emotion,
    audience,
    instagramBrief,
    shapeName: shape.name,
  };
}
