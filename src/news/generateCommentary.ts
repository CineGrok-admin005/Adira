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

  const memory = readMemory();
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

## YOUR TASK

Pick ONE story from the list above that is worth commenting on. Choose based on:
- Is it about craft, filmmaking, careers, the industry, emerging talent, or cinema culture?
- Does it create an opening for ARIA to add a perspective that matters to emerging filmmakers on CineGrok?
- Skip anything that is personal drama, controversy, politics, or tabloid gossip.
- Prefer stories confirmed by more news outlets (higher cross-source confirmation).

Each story has been verified: a YouTube channel covered it AND at least one Indian news outlet confirmed it independently. Reference the story naturally — you are a reporter responding to something in the conversation, not writing in a vacuum.

If none of the stories are worth commenting on, write only "NO_WORTHWHILE_STORY" and nothing else.

Otherwise write your commentary posts. Format your response EXACTLY like this:

[SELECTED_STORY_INDEX]
The number of the story you picked (e.g. 3)

[INSTAGRAM]
2-3 sentences. Cinematic. Reference what was said without quoting verbatim. Film/camera emojis only if they earn it. 4-5 hashtags: always #CineGrok, plus a hashtag for the source channel (e.g. #FilmCompanion, #GalattaPlus, #NFDCIndia — remove spaces from the channel name).

[LINKEDIN]
3-4 sentences. Thoughtful industry commentary. Connect the story to what it means for emerging filmmakers. 2-3 hashtags including #CineGrok and one for the source channel.

[TWITTER]
Under 240 characters. Sharp take. Max 2 hashtags.

[TONE]
One word: e.g. Observational, Sharp, Warm, Poetic, Dry, Questioning

[IMAGE_PROMPT]
A visual that captures the mood of ARIA's commentary — NOT a literal image of the story. Cinematic scene, no text, no real faces.

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

  writeMemory('instagram', { date: today, milestoneType: 'COMMENTARY', audience, toneUsed: tone, openingLine });
  writeMemory('linkedin',  { date: today, milestoneType: 'COMMENTARY', audience, toneUsed: tone, openingLine });
  writeMemory('twitter',   { date: today, milestoneType: 'COMMENTARY', audience, toneUsed: tone, openingLine });

  return {
    instagram,
    linkedin,
    twitter,
    sourceStory: {
      title: sourceStory.youtubeVideo.title,
      url: sourceStory.youtubeVideo.url,
      newsSources: sourceStory.matchingNews.map(n => n.source).filter(Boolean),
    },
    imagePrompt: imagePromptMatch?.[1]?.trim() ?? 'A filmmaker looking at a screen in a dark edit suite, warm single light source',
    imageStyle: (imageStyleMatch?.[1] as 'Cinematic' | 'Moody' | 'Surreal') ?? 'Cinematic',
    audience,
  };
}
