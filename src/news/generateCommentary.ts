import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

import { ADIRA_SYSTEM_PROMPT } from '../aria/characterCard';
import { readMemory, writeMemory } from '../aria/memory';
import { getAudienceMode, audienceContext } from '../aria/audience';
import { VerifiedStory, CommentaryPost } from '../types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generateCommentary(stories: VerifiedStory[]): Promise<CommentaryPost | null> {
  if (stories.length === 0) return null;

  const memory = await readMemory();
  const audience = getAudienceMode();

  const storyList = stories
    .slice(0, 8)
    .map((s, i) => {
      const sources = s.matchingNews.map(n => n.source).filter(Boolean).join(', ');
      return `[${i + 1}] ${s.youtubeVideo.channelTitle} (YouTube):\n"${s.youtubeVideo.title}"\n${s.youtubeVideo.url}\nAlso covered by: ${sources || 'Indian press'}`;
    })
    .join('\n\n');

  const prompt = `${audienceContext(audience)}

## YOUR MEMORY (recent posts — do not repeat these tones or openings)
${memory.instagram.length > 0 || memory.linkedin.length > 0 || memory.twitter.length > 0
    ? [
        ...memory.instagram.slice(-3).map(p => `Instagram (${p.date}): "${p.openingLine}" [${p.toneUsed}]`),
        ...memory.linkedin.slice(-3).map(p => `LinkedIn (${p.date}): "${p.openingLine}" [${p.toneUsed}]`),
        ...memory.twitter.slice(-3).map(p => `Twitter (${p.date}): "${p.openingLine}" [${p.toneUsed}]`),
      ].join('\n')
    : 'No recent posts yet.'}

## TODAY'S VERIFIED STORIES FROM INDIAN CINEMA

${storyList}

## SKIP THIS STORY IF:
- It is a music release, song launch, or promotional trailer
- It is a celebrity appearance, award show recap, or gossip
- You cannot answer "what does this change for a filmmaker who hasn't had their break yet?"
- If there is no real answer — write "NO_WORTHWHILE_STORY"

## BEFORE YOU WRITE — find the angle that matters

Find the one story where you can say something specific to the person who is three steps behind the people in the headline. Not "here's what happened." Not "here's the lesson." The specific thing this unlocks, or closes, or proves.

## WHAT ADIRA SOUNDS LIKE — study these before writing

BAD (do not write like this):
"A powerful OST can make all the difference in a film. For emerging filmmakers, it's a reminder to pay attention to every detail of the cinematic experience."
→ This is a blog post. Generic. No point of view. Could have been written by anyone about anything.

GOOD (write like this):
"Ajaneesh Loknath scored KGF when nobody knew his name. Hombale trusted him anyway. Now his name is on every poster. The question for everyone building their reel on CineGrok right now: are you putting yourself where that trust can find you? 🎬 #CineGrok #HombaleFilms #IndianCinema"
→ Specific. Asks a real question. Makes the reader feel something.

BAD:
"The Indian film industry is evolving. Emerging filmmakers should take note of these changes and adapt their strategies accordingly."
→ Empty. Says nothing.

GOOD:
"Netflix India just committed to 40 Indian originals. That is 40 directors who will get their first real budget this year. One of them could be building their portfolio on CineGrok right now. The door is open. The question is who walks through it. #CineGrok #NetflixIndia"
→ Concrete number. Real stakes. Speaks directly to the person reading.

## YOUR TASK

Pick ONE story worth commenting on. Write in ADIRA's voice — specific, with a point of view, not summarising but reacting.

If none qualify, write only "NO_WORTHWHILE_STORY" and nothing else.

Format EXACTLY:

[SELECTED_STORY_INDEX]
The number of the story you picked (e.g. 3)

[INSTAGRAM]
2-3 sentences. Specific and cinematic. Must have a real point of view — not a summary. Film/camera emojis only if they earn it. Focus on Social SEO by integrating highly searched keywords naturally into the caption text.
Hashtags (max 3): always #CineGrok + the specific show or person discussed + 1 hyper-specific topic. No generic hashtags. Remove spaces, capitalise each word.

[LINKEDIN]
3-4 sentences. Each sentence should do different work — don't restate the same point. Connect to what this means for someone at the start of their career.
Hashtags (2-3): #CineGrok + source channel + specific show or film name.

[TWITTER]
Under 240 characters. One punch. Something worth quoting.
Hashtags (max 2): #CineGrok + either the source channel OR the specific show/film name — whichever is more searchable.

[TONE]
One word: e.g. Observational, Sharp, Warm, Poetic, Dry, Questioning

[IMAGE_PROMPT]
Write a fully filled ChatGPT image prompt in EXACTLY this format — no placeholders, every field answered:

POST CATEGORY: [Milestone / Commentary / News / Community / Industry Reaction / Update]
WHAT HAPPENED: [one sentence]
WHY THIS MATTERS: [one sentence about emerging filmmakers]
SHOULD ADIRA BE IN THIS? Yes
ADIRA'S ROLE: [Reporting / Reacting / Observing / Investigating / Announcing]
SCENE: [specific environment]
ACTION: [exactly what she is doing]
EXPRESSION: [Focused / Reflective / Sharp / Curious / Concerned]
WARDROBE: [specific clothing]
PROPS: [specific props including press lanyard reading "ADIRA / CineGrok"]
LIGHTING: [specific lighting]
MOOD: [Excited / Serious / Reflective / Intense]

[IMAGE_STYLE]
One of: Cinematic / Moody / Surreal`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1200,
    messages: [
      { role: 'system', content: ADIRA_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';

  if (text.trim() === 'NO_WORTHWHILE_STORY') {
    console.log('💤 ARIA found no story worth commenting on today.');
    return null;
  }

  const indexMatch      = text.match(/\[SELECTED_STORY_INDEX\]\s*(\d+)/);
  const instagramMatch  = text.match(/\[INSTAGRAM\]\s*([\s\S]*?)(?=\[LINKEDIN\])/);
  const linkedinMatch   = text.match(/\[LINKEDIN\]\s*([\s\S]*?)(?=\[TWITTER\])/);
  const twitterMatch    = text.match(/\[TWITTER\]\s*([\s\S]*?)(?=\[TONE\])/);
  const toneMatch       = text.match(/\[TONE\]\s*([\s\S]*?)(?=\[IMAGE_PROMPT\])/);
  const imagePromptMatch = text.match(/\[IMAGE_PROMPT\]\s*([\s\S]*?)(?=\[IMAGE_STYLE\])/);
  const imageStyleMatch  = text.match(/\[IMAGE_STYLE\]\s*(Cinematic|Moody|Surreal)/);

  const SIG = '\n\n— ADIRA, CineGrok';
  const addSig = (t: string) => t.includes('— ADIRA, CineGrok') ? t : t + SIG;

  const instagram = addSig(instagramMatch?.[1]?.trim() ?? '');
  const linkedin  = addSig(linkedinMatch?.[1]?.trim()  ?? '');
  const twitter   = addSig(twitterMatch?.[1]?.trim()   ?? '');

  if (!instagramMatch?.[1] || !linkedinMatch?.[1] || !twitterMatch?.[1]) {
    console.error('❌ generateCommentary: failed to parse posts from response');
    return null;
  }

  const selectedIndex = parseInt(indexMatch?.[1] ?? '1', 10) - 1;
  const sourceStory = stories[selectedIndex] ?? stories[0];
  const tone = toneMatch?.[1]?.trim() ?? 'Observational';

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
    twitter,
    sourceStory: {
      title: sourceStory.youtubeVideo.title,
      url: sourceStory.youtubeVideo.url,
      newsSources: sourceStory.matchingNews.map(n => n.source).filter(Boolean),
      originalIndex: selectedIndex
    },
    imagePrompt: imagePromptMatch?.[1]?.trim() ?? 'A filmmaker looking at a screen in a dark edit suite, warm single light source',
    imageStyle: (imageStyleMatch?.[1] as 'Cinematic' | 'Moody' | 'Surreal') ?? 'Cinematic',
    audience,
  };
}
