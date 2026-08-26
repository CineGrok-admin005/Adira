import { resolveModels, fitToBudget, TPM_BUDGET } from '../llm/models';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

import { ADIRA_SYSTEM_PROMPT } from '../aria/characterCard';
import { expandLinkedInIfShort, parseLinkedInLengthTag, stripLengthDeclaration } from '../aria/linkedinLength';
import { enforceLinkedInQuality } from '../aria/qualityGate';
import { readMemory, writeMemory } from '../aria/memory';
import { getAudienceMode, audienceContext } from '../aria/audience';
import { COMMENTARY_SHAPES, pickShape, type PostShape } from '../aria/postShapes';
import { fetchArticleText } from './fetchArticle';
import { rankStories } from './rankStories';
import { extractProperNouns } from './crossVerify';
import { VerifiedStory, CommentaryPost } from '../types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// `shapeOverride` exists so the shape smoke test (src/scripts/test-shapes.ts) can exercise
// every arc in one run. Production never passes it — the shape is picked per IST day + slot.
export async function generateCommentary(stories: VerifiedStory[], shapeOverride?: PostShape): Promise<CommentaryPost | null> {
  if (stories.length === 0) return null;

  const memory = await readMemory();
  const audience = getAudienceMode();
  const shape = shapeOverride ?? pickShape(COMMENTARY_SHAPES);
  console.log(`   Post shape: ${shape.name}`);

  const clean = (t: string) => (t || '').replace(/\s+/g, ' ').trim();

  // Drop off-beat junk (gossip/music/politics) and float real industry-decision stories to the
  // top before the model picks. Falls back to the raw list if filtering empties it.
  const pool = rankStories(stories);
  const candidates = pool.slice(0, 3);

  // Budget note: Groq free tier caps requests at 12,000 tokens/min (input + reserved output).
  // So we keep the candidate list lean and put the real depth (full article text) only on the
  // top few. This lands the request around ~7-8k tokens — comfortably under the cap.
  const MAX_OUTPUT_TOKENS = 1800;
  const ARTICLE_STORIES = 1;   // full article body for the top candidate only
  const ARTICLE_CHARS = 500;   // chars of article body injected per story

  const storyBlocks = await Promise.all(
    candidates.map(async (s, i) => {
      const v = s.youtubeVideo;
      const desc = clean(v.description).slice(0, 200);
      const coverage = s.matchingNews
        .slice(0, 1)
        .map(n => {
          const nd = clean(n.description).slice(0, 150);
          return `   • ${n.source || 'Press'}: "${clean(n.title)}"${nd ? ` — ${nd}` : ''}`;
        })
        .join('\n');

      // Fetch the lead press article's body for the top stories (skip YouTube links).
      let fullReport = '';
      if (i < ARTICLE_STORIES) {
        const lead = s.matchingNews.find(n => n.link && !/youtube\.com|youtu\.be/i.test(n.link));
        if (lead?.link) {
          const body = await fetchArticleText(lead.link);
          if (body) fullReport = `\nFull report (${lead.source || 'press'}): ${clean(body).slice(0, ARTICLE_CHARS)}`;
        }
      }

      return `[${i + 1}] ${v.channelTitle} (YouTube): "${clean(v.title)}"
URL: ${v.url}
What the video itself says: ${desc || '(no description available)'}
Press coverage of the same story:
${coverage || '   • (no additional press detail)'}${fullReport}`;
    })
  );

  const buildPrompt = (storyListArg: string) => `${audienceContext(audience)}

## YOUR MEMORY (recent posts — do not repeat these tones or openings)
${memory.instagram.length > 0 || memory.linkedin.length > 0 || memory.twitter.length > 0
    ? [
        ...memory.instagram.slice(-3).map(p => `Instagram (${p.date}): "${p.openingLine}" [${p.toneUsed}]`),
        ...memory.linkedin.slice(-3).map(p => `LinkedIn (${p.date}): "${p.openingLine}" [${p.toneUsed}]`),
        ...memory.twitter.slice(-3).map(p => `Twitter (${p.date}): "${p.openingLine}" [${p.toneUsed}]`),
      ].join('\n')
    : 'No recent posts yet.'}

## TODAY'S VERIFIED STORIES FROM INDIAN CINEMA

${storyListArg}

## GROUNDING — THE MOST IMPORTANT RULE
Every concrete claim you write must come from the verified story you pick above — its title, "what the video itself says", its press coverage, or its "Full report" (the actual article text — your richest source of specific names, numbers and quotes; mine it for the concrete detail that makes a post un-generic). Never introduce a number, a slate, an announcement, a name, or an event that is not in that story. Do not reuse facts from the examples further down (they show tone only). If the story you picked does not give you enough specific detail to say something true and worth reading, write "NO_WORTHWHILE_STORY" instead of padding it with generic claims.

## SKIP THIS STORY IF:
- It is a music release, song launch, or promotional trailer
- It is a celebrity appearance, award show recap, or gossip
- There is no concrete fact in it — no number, no name, no date, no decision you could verify
- If the coverage is all adjectives and no facts — write "NO_WORTHWHILE_STORY"

## BEFORE YOU WRITE — you are reporting, not commenting

Pick the story where the coverage actually contains something concrete: a figure, a runtime, a budget, a date, a named decision. Your job is to report that clearly and add what a reader wouldn't already have — a comparison, a precedent, a source that disagrees.

You are not the industry's analyst and you are not anyone's teacher. You are the one who went and checked. That is the whole value. A reader should finish knowing something they didn't know, not knowing what you think they should do about it.

## THE SPECIFICITY GATE
Before you finish: could this sentence have been written about a different person, film, or week? If yes, delete it and write the specific thing instead. Never invent a name, number or event not in the story you picked.

## YOUR TASK

Pick ONE story with real facts in it and report it. Write in ADIRA's voice — specific, precise, first-hand about the checking. Reporting, not reacting: what happened and what the sources say, not what it signals.

If none qualify, write only "NO_WORTHWHILE_STORY" and nothing else.

Format EXACTLY:

[SELECTED_STORY_INDEX]
The number of the story you picked (e.g. 3)

[INSTAGRAM]
2-3 sentences. Specific and cinematic. Must have a real point of view — not a summary. Film/camera emojis only if they earn it. Focus on Social SEO by integrating highly searched keywords naturally into the caption text.
Hashtags (max 3): always #CineGrok + the specific show or person discussed + 1 hyper-specific topic. No generic hashtags. Remove spaces, capitalise each word.

[LINKEDIN]
[LINKEDIN_LENGTH: SHORT or LONG — state exactly which one you're about to write, then hit that target for real]
Write to the LinkedIn playbook in your character (dwell time is the game). The goal is a post a real person reads to the end and replies to — not a 3-line news recap.

DECIDE THE LENGTH FROM HOW MUCH THE SOURCES ACTUALLY GIVE YOU:
- If the reporting yields one clean fact — a single number, one verified decision — declare SHORT and write 300-600 chars. A short accurate report beats a padded one.
- If there is genuinely more to lay out — several facts, a disagreement between sources, a figure that needs context — declare LONG and write 1,300-2,000 chars.
- Let the facts decide. If you have one fact, say it and stop; do not inflate it to reach a length.

THE FIRST LINE (above the ~210-char "see more" fold) decides ~80% of reach. Lead with the hardest, most concrete thing you have — the number, the name, the decision — stated flat. Never open with a preamble, a question, or a scene-setting generality about the industry.

TODAY'S SHAPE — "${shape.name}". This is the arc of the post, not wording to copy:
${shape.brief}

Follow that arc, including how it ends. If the shape closes on a statement, do not tack a question on anyway — a flat closing line is usually stronger than a question nobody answers. If it closes on a question, ask exactly one, as the final line before the hashtags, and make it something only a working filmmaker could answer. Never use engagement bait ("who's ready", "thoughts?", "tag someone"). Never scatter rhetorical questions through the middle.

⛔ NEVER write the scaffolding out loud. Do not write phrases like "the real tension is", "this changes one thing", "for the filmmaker still building their first reel", "what this means is", or "one specific question:". Those name the structure — they are not sentences. Write the actual specific thing instead. If a line could open any post about any story, delete it.

GROUNDING: every concrete claim must come from TODAY'S story (its title, what the video says, or the press coverage). If the story is too thin to say anything specific and true, the LinkedIn post will read generic — in that case pick a different story or return NO_WORTHWHILE_STORY. Generic is the failure mode. A reader should finish the post knowing it could only have been written about THIS story.

FORMAT: short paragraphs (1-2 sentences), white space between them, scannable on a phone. First-person, human, a real point of view — you're a person on LinkedIn, not a brand page. One idea only.
Do NOT put any link or URL anywhere — not in the body, not in a comment. Outbound links cost reach and the first-comment workaround is detected now. cinegrok.in lives in the profile, not the post.
Hashtags: exactly 2, and only real proper nouns — the film, the festival, the studio. Never the word "Hashtags:" itself.

Having declared LONG, write 1,300-2,000 characters — a LONG post under 1,000 characters has not done its job. Every paragraph needs its own real content pulled from today's story. If you can only fill them by restating your hook in different words, the story is too thin for LONG — declare SHORT instead and write 300-600 characters. Put that declaration in the length tag at the top of this section, never in the post text itself.

End on your hashtags; the "— ADIRA, CineGrok" byline is added for you. Never invent a name, number or event that isn't in today's story.

[TWEET_BRIEF]
Do NOT write a tweet. Write a short brief that the CineGrok Tweets project (Claude) will turn into the actual viral tweet. Keep it to these three lines:
STORY: [what happened — one specific line, with the real name/number/title]
THE DETAIL: [the most concrete fact in the coverage — a number, a runtime, a budget, a date. Not what it means. The fact itself.]
SOURCING: [who reported it, and whether the sources agree]

[TONE]
One word: e.g. Observational, Sharp, Warm, Poetic, Dry, Questioning

[EMOTION]
Pick one: excited / thoughtful / reporting / serious / warm

[IMAGE_PROMPT]
ADIRA must look mid-reaction — not posing. She has something to say. Every field required.

Choose EXPRESSION to match EMOTION (eyes, brows, mouth, posture, hands — one short phrase each).

POST CATEGORY: [Report / Verified Fact / Industry News]
WHAT HAPPENED: [one sentence]
THE CONCRETE DETAIL: [the specific fact the image should evoke — a place, an object, a number. Not an abstraction.]
SHOULD ADIRA BE IN THIS?
  Write "No" when: the story is about a specific film, show, festival, or person (e.g. Raja Shivaji, Netflix India slate, MAMI lineup). The image should be a cinematic concept visual — a film set, a spotlight, a clapperboard, a festival marquee. No character needed.
  Write "Yes" when: ADIRA is making a personal observation about the filmmaker community itself, or the post is about CineGrok's own growth and voice.
  Rule of thumb: if the image would say MORE by showing the subject rather than the reporter — write No.
ADIRA'S ROLE: [Reporting / Reacting / Observing]
SCENE: [if Yes: specific location for ADIRA. If No: describe the concept visual — e.g. "empty cinema with single spotlight on stage", "film clapperboard against a dark background with city lights"]
ACTION: [if Yes: active verb describing ADIRA. If No: describe the visual action — e.g. "spotlight fading in", "clapperboard snapping shut"]
EXPRESSION: [if Yes: full face/body description. If No: write "N/A — concept image"]
WARDROBE: [if Yes: specific clothing. If No: write "N/A"]
PROPS: [if Yes: press lanyard "ADIRA / CineGrok" + items. If No: props relevant to the concept]
LIGHTING: [specific lighting mood regardless]
MOOD: [one word]
SPEECH BUBBLE: [one punchy sentence — if Yes: what ADIRA says. If No: a short quote that could appear as a text overlay on the concept image]

[IMAGE_STYLE]
One of: Cinematic / Moody / Surreal

[INSTAGRAM_BRIEF]
Write a brief for Claude to generate a high-quality Instagram carousel. Format EXACTLY as shown:

PILLAR: [pick the most relevant: CRAFT BREAKDOWN / INDUSTRY PULSE / FILMMAKER SPOTLIGHT / EDUCATIONAL FRAMEWORK / COMMUNITY QUESTION]

CORE STORY IN ONE LINE: [the single most interesting angle from this story for an emerging filmmaker]

KEY DATA POINTS:
- [2-3 bullet facts from the story that matter most to emerging filmmakers]

EMOTIONAL ANGLE: [what feeling should this carousel leave — felt seen / learned something / want to act / surprised]

SUGGESTED HOOK FOR SLIDE 1: [one sharp specific opening line — the sharpest version of the point]`;
  // Enforce the token budget at RUNTIME, not with hand-tuned constants. The prompt grows on
  // its own as memory fills, and that is exactly what silently broke posting on 2026-08-13:
  // constants sized for a 12,000 cap, memory creeping up daily, then one day it crossed.
  const fitted = fitToBudget(
    storyBlocks,
    (kept) => ADIRA_SYSTEM_PROMPT + buildPrompt(kept.join('\n\n')),
    MAX_OUTPUT_TOKENS,
  );
  if (fitted.dropped > 0) {
    console.log(`   Dropped ${fitted.dropped} candidate(s) to fit the ${TPM_BUDGET}-token budget.`);
  }
  const storyList = fitted.kept.join('\n\n');

  const prompt = buildPrompt(storyList);

  const response = await groq.chat.completions.create({
    model: (await resolveModels()).writer,
    // openai/gpt-oss-120b is a REASONING model: its chain-of-thought is billed against
    // max_completion_tokens BEFORE the visible answer. Observed 2026-08-26: with reasoning
    // left on, a 1,800-token budget was consumed entirely by reasoning and finish_reason
    // came back "length" with no [LINKEDIN]/[INSTAGRAM] text at all. hidden+low keeps the
    // full budget for the post itself.
    reasoning_effort: 'low',
    reasoning_format: 'hidden',
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: ADIRA_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });
  console.log(`   🔢 Groq usage: ${response.usage?.total_tokens ?? '?'} tokens (prompt ${response.usage?.prompt_tokens ?? '?'} / completion ${response.usage?.completion_tokens ?? '?'}), finish_reason=${response.choices[0]?.finish_reason}`);

  const text = response.choices[0]?.message?.content ?? '';

  if (text.trim() === 'NO_WORTHWHILE_STORY') {
    console.log('💤 ARIA found no story worth commenting on today.');
    return null;
  }

  const indexMatch      = text.match(/\[SELECTED_STORY_INDEX\]\s*(\d+)/);
  const instagramMatch  = text.match(/\[INSTAGRAM\]\s*([\s\S]*?)(?=\[LINKEDIN\])/);
  // See the note in generateExplainer: the model sometimes opens the section with
  // [LINKEDIN_LENGTH: ...] instead of [LINKEDIN]. Accept either as the opener.
  let linkedinMatch     = text.match(/\[LINKEDIN(?:_LENGTH)?[^\]]*\]\s*(?:\[LINKEDIN_LENGTH:[^\]]*\]\s*)?([\s\S]*?)(?=\[TWEET_BRIEF\])/);

  // Last-resort positional fallback. Observed 2026-08-09: on two of three shapes the model
  // omitted the [LINKEDIN] header altogether — not swapped for [LINKEDIN_LENGTH], just gone —
  // while still emitting [INSTAGRAM] and [TWEET_BRIEF] around it. The section is right there
  // between them; only the label is missing, and throwing away a good post over a missing
  // label is the worst possible trade. Take what sits between the two known markers.
  if (!linkedinMatch?.[1]?.trim()) {
    const positional = text.match(/\[INSTAGRAM\][\s\S]*?\n\s*\n([\s\S]*?)(?=\[TWEET_BRIEF\])/);
    if (positional?.[1]?.trim()) {
      console.warn('   ⚠️  [LINKEDIN] header missing — recovered the section positionally.');
      linkedinMatch = positional;
    }
  }
  // Read the declaration from the whole response, in any form the model emits it.
  const declaredLengthTag = parseLinkedInLengthTag(text);
  const tweetBriefMatch = text.match(/\[TWEET_BRIEF\]\s*([\s\S]*?)(?=\[TONE\])/);
  const toneMatch        = text.match(/\[TONE\]\s*([\s\S]*?)(?=\[EMOTION\]|\[IMAGE_PROMPT\])/);
  const emotionMatch     = text.match(/\[EMOTION\]\s*(excited|thoughtful|reporting|serious|warm)/i);
  const imagePromptMatch    = text.match(/\[IMAGE_PROMPT\]\s*([\s\S]*?)(?=\[IMAGE_STYLE\])/);
  const imageStyleMatch     = text.match(/\[IMAGE_STYLE\]\s*(Cinematic|Moody|Surreal)/);
  const instagramBriefMatch = text.match(/\[INSTAGRAM_BRIEF\]\s*([\s\S]*?)$/);

  const SIG = '\n\nhttps://cinegrok.in\n— ADIRA, CineGrok';
  const SIG_LI = '\n\n— ADIRA, CineGrok'; // LinkedIn down-ranks outbound links — link goes in first comment, not the body
  // Strip stray bracket labels the model sometimes leaks (e.g. [LINKEDIN_HASHTAGS])
  const stripTags = (t: string) => (t ?? '').replace(/\[[A-Z][A-Z_ ]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const addSig = (t: string) => t.includes('— ADIRA, CineGrok') ? t : t + SIG;
  const addSigLi = (t: string) => t.includes('— ADIRA, CineGrok') ? t : t + SIG_LI;

  const instagram = addSig(stripTags(instagramMatch?.[1] ?? ''));

  if (!instagramMatch?.[1] || !linkedinMatch?.[1]) {
    // Returning null here exits the run quietly. With rotating skeletons that is a real risk:
    // a shape the model formats badly would stop publishing with no signal at all.
    console.error('❌ generateCommentary: failed to parse posts from response');
    const { notifyFailure } = await import('../telegram/notifyFailure');
    await notifyFailure(
      'Commentary (Type 2) — could not parse the model response',
      new Error(
        `Missing ${!instagramMatch?.[1] ? '[INSTAGRAM]' : ''}${!instagramMatch?.[1] && !linkedinMatch?.[1] ? ' and ' : ''}${!linkedinMatch?.[1] ? '[LINKEDIN]' : ''} section.\n\nFirst 800 chars of response:\n${text.slice(0, 800)}`
      )
    );
    return null;
  }

  // Remove any cinegrok.in URL the model may have written into the LinkedIn body
  let linkedinBody = stripLengthDeclaration(stripTags(linkedinMatch[1]))
    .replace(/https?:\/\/(www\.)?cinegrok\.in\/?\S*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const declaredLength = declaredLengthTag;

  // Ground the retry in whichever candidate the DRAFT is actually about — same proper-noun
  // overlap approach as the sourceStory match below (not the unreliable [SELECTED_STORY_INDEX]
  // tag), just run early against the pre-retry text.
  const draftText = `${linkedinBody}\n${instagram}`.toLowerCase();
  const overlapFor = (s: VerifiedStory): number => {
    const nouns = [...extractProperNouns(s.youtubeVideo.title), ...extractProperNouns(s.matchingNews[0]?.title ?? '')];
    return nouns.filter(n => n.length >= 3 && draftText.includes(n.toLowerCase())).length;
  };
  const groundingStory = candidates.reduce((best, s) => overlapFor(s) > overlapFor(best) ? s : best, candidates[0]);
  const storyContext = groundingStory
    ? `${groundingStory.youtubeVideo.title}\n${groundingStory.matchingNews.slice(0, 2).map(n => `${n.source || 'Press'}: ${n.title}`).join('\n')}`
    : '';

  const lengthResult = await expandLinkedInIfShort(groq, linkedinBody, declaredLength, storyContext);
  linkedinBody = lengthResult.text;
  console.log(`   💼 LinkedIn: ${lengthResult.originalLength} chars (declared ${lengthResult.declaredTarget})${lengthResult.retried ? ` → retried → ${lengthResult.finalLength} chars` : ''}`);

  // Banned phrases and the question budget are enforced HERE, not in the prompt. The prompt
  // has banned "journey" since day one and it still shipped. One rewrite, then rejection —
  // publishing nothing beats publishing filler, which costs reach on everything after it.
  const quality = await enforceLinkedInQuality(groq, linkedinBody, storyContext);
  linkedinBody = quality.text;
  if (!quality.passed) {
    console.error(`❌ generateCommentary: quality gate rejected the post — ${quality.violations.join(' | ')}`);
    const { notifyFailure } = await import('../telegram/notifyFailure');
    await notifyFailure(
      'Commentary (Type 2) — post rejected by quality gate, nothing published',
      new Error(`${quality.violations.join('\n')}\n\nDraft:\n${linkedinBody.slice(0, 600)}`),
    );
    return null;
  }

  const linkedin  = addSigLi(linkedinBody);
  // Tweet brief = context for the Tweets Claude project (NOT a finished tweet). No signature.
  const tweetBrief = (tweetBriefMatch?.[1] ?? '').replace(/\n{3,}/g, '\n\n').trim();

  // Which story is the post ACTUALLY about? The 70B model's reported index is unreliable, so
  // match the written post's proper nouns against each candidate's title. Fall back to the
  // reported index, then to the top candidate. This keeps the source link + image consistent
  // with what was written.
  const postText = `${linkedin}\n${instagram}`.toLowerCase();
  const contentOverlap = (s: VerifiedStory): number => {
    const nouns = [
      ...extractProperNouns(s.youtubeVideo.title),
      ...extractProperNouns(s.matchingNews[0]?.title ?? ''),
    ];
    let hits = 0;
    for (const n of nouns) if (n.length >= 3 && postText.includes(n.toLowerCase())) hits++;
    return hits;
  };
  let sourceStory = candidates[0];
  let bestOverlap = 0;
  for (const s of candidates) {
    const o = contentOverlap(s);
    if (o > bestOverlap) { bestOverlap = o; sourceStory = s; }
  }
  if (bestOverlap === 0) {
    const reported = parseInt(indexMatch?.[1] ?? '1', 10) - 1;
    sourceStory = candidates[reported] ?? candidates[0];
  }
  // Index into the ORIGINAL array so the caller can queue the unused stories correctly.
  const originalIndex = Math.max(0, stories.indexOf(sourceStory));

  // The model often echoes the prompt's own "One word:" label into the value, which then gets
  // stored as the tone and fed back into the next post's anti-repetition block as
  // "[One word: Instructive]" — noise where a real tone should be. Strip the label and keep
  // only the first line.
  const tone = (toneMatch?.[1] ?? '')
    .replace(/^\s*one word\s*:\s*/i, '')
    .split('\n')[0]
    .trim() || 'Observational';
  const validEmotions = ['excited', 'thoughtful', 'reporting', 'serious', 'warm'] as const;
  const rawEmotion = emotionMatch?.[1]?.toLowerCase().trim() ?? 'thoughtful';
  const emotion = (validEmotions.includes(rawEmotion as typeof validEmotions[number]) ? rawEmotion : 'thoughtful') as import('../types').EmotionState;

  const today = new Date().toISOString().split('T')[0];
  const openingLine = instagram.split('\n')[0].slice(0, 80);

  await Promise.all([
    writeMemory('instagram', { date: today, milestoneType: 'COMMENTARY', audience, toneUsed: tone, openingLine }),
    writeMemory('linkedin',  { date: today, milestoneType: 'COMMENTARY', audience, toneUsed: tone, openingLine }),
    writeMemory('twitter',   { date: today, milestoneType: 'COMMENTARY', audience, toneUsed: tone, openingLine }),
  ]);

  return {
    instagram,
    linkedin,
    tweetBrief,
    sourceStory: {
      title: sourceStory.youtubeVideo.title,
      url: sourceStory.youtubeVideo.url,
      newsSources: sourceStory.matchingNews.map(n => n.source).filter(Boolean),
      originalIndex
    },
    imagePrompt: imagePromptMatch?.[1]?.trim() ?? 'A filmmaker looking at a screen in a dark edit suite, warm single light source',
    imageStyle: (imageStyleMatch?.[1] as 'Cinematic' | 'Moody' | 'Surreal') ?? 'Cinematic',
    emotion,
    audience,
    instagramBrief: instagramBriefMatch?.[1]?.trim(),
    shapeName: shape.name,
  };
}
