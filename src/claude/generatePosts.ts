// TEMPORARY: Using Groq (free) while Anthropic credits are topped up.
// To switch back to Claude: swap Groq import/client with Anthropic SDK.
// The prompt structure (system + user) works identically on both.
import Groq from 'groq-sdk';
import { MilestoneEvent, GeneratedPosts } from '../types';
import { ARIA_SYSTEM_PROMPT } from '../aria/characterCard';
import { readMemory, writeMemory, formatMemoryContext } from '../aria/memory';
import { getAudienceMode, audienceContext } from '../aria/audience';
import dotenv from 'dotenv';
dotenv.config();

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generatePosts(event: MilestoneEvent): Promise<GeneratedPosts> {
  const { data } = event;
  const memory = readMemory();
  const audience = getAudienceMode();
  const memoryContext = formatMemoryContext(memory);

  const joinersLine = data.recentPublicJoiners.length > 0
    ? `Recent joiners: ${data.recentPublicJoiners
        .filter(j => j.city)
        .map(j => `${j.firstName} (${j.primaryRole}, ${j.city})`)
        .join(', ')}`
    : '';

  const userPrompt = `## TODAY'S DATA
- Total real filmmakers on CineGrok: ${data.totalRealUsers}
- New joiners today: ${data.newToday}
- New joiners this week: ${data.newThisWeek}
- Milestone: ${event.message}
${joinersLine}

## AUDIENCE MODE TODAY
${audienceContext(audience)}

## YOUR RECENT POST HISTORY — do not repeat any tone or opening structure below
${memoryContext}

## YOUR TASK
Write 3 posts for today's milestone. Each platform gets a completely different tone and angle — not just reformatted versions of the same post.

Choose a different tone from your rotation for each platform. State which tone you used in the [TONE] tag.

Format EXACTLY as follows (keep all labels):

[INSTAGRAM]
[TONE: <tone name>]
<2-3 sentences. Emotional, cinematic. Film/camera emojis used naturally. End with 4-5 hashtags always including #CineGrok>

[LINKEDIN]
[TONE: <tone name>]
<3-4 sentences. Professional but human. No excessive emojis. End with 2-3 hashtags>

[TWITTER]
[TONE: <tone name>]
<Under 240 characters. One punch. Max 2 hashtags>

[IMAGE_PROMPT]
<One detailed image generation prompt that captures the mood of today's posts. Indian aesthetic, film world, cinematic. Be specific about style, lighting, composition>

[IMAGE_STYLE]
<Pick one: Cinematic / Moody / Surreal — based on today's tone>

RULES:
- Every post ends with: — ARIA, CineGrok
- Never mention emails, phone numbers, user IDs, or internal data
- Never use full names — first name only
- Never say: thrilled, excited, proud to announce, journey, ecosystem, game-changer, struggling
- Write like someone who genuinely cares about these filmmakers, not a brand account`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: ARIA_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';

  // Parse posts
  const instagramMatch = text.match(/\[INSTAGRAM\]\n(?:\[TONE:[^\]]*\]\n)?([\s\S]*?)(?=\[LINKEDIN\])/);
  const linkedinMatch  = text.match(/\[LINKEDIN\]\n(?:\[TONE:[^\]]*\]\n)?([\s\S]*?)(?=\[TWITTER\])/);
  const twitterMatch   = text.match(/\[TWITTER\]\n(?:\[TONE:[^\]]*\]\n)?([\s\S]*?)(?=\[IMAGE_PROMPT\])/);
  const imagePromptMatch = text.match(/\[IMAGE_PROMPT\]\n([\s\S]*?)(?=\[IMAGE_STYLE\])/);
  const imageStyleMatch  = text.match(/\[IMAGE_STYLE\]\n([\s\S]*?)$/);

  // Parse tones for memory
  const instaTone   = text.match(/\[INSTAGRAM\]\n\[TONE:\s*([^\]]+)\]/)?.[1]?.trim() ?? 'unknown';
  const linkedTone  = text.match(/\[LINKEDIN\]\n\[TONE:\s*([^\]]+)\]/)?.[1]?.trim() ?? 'unknown';
  const twitterTone = text.match(/\[TWITTER\]\n\[TONE:\s*([^\]]+)\]/)?.[1]?.trim() ?? 'unknown';

  const SIG = '\n\n— ARIA, CineGrok';
  const addSig = (t: string) => t.includes('— ARIA, CineGrok') ? t : t + SIG;

  const instagram = addSig(instagramMatch?.[1]?.trim() ?? 'Could not generate Instagram post');
  const linkedin  = addSig(linkedinMatch?.[1]?.trim()  ?? 'Could not generate LinkedIn post');
  const twitter   = addSig(twitterMatch?.[1]?.trim()   ?? 'Could not generate Twitter post');
  const imagePrompt = imagePromptMatch?.[1]?.trim() ?? 'Cinematic film set in India, warm golden lighting, filmmaker at work';
  const rawStyle  = imageStyleMatch?.[1]?.trim() ?? 'Cinematic';
  const imageStyle = (['Cinematic', 'Moody', 'Surreal'].includes(rawStyle)
    ? rawStyle
    : 'Cinematic') as 'Cinematic' | 'Moody' | 'Surreal';

  const today = new Date().toISOString().split('T')[0];

  // Write to memory per platform
  writeMemory('instagram', { date: today, milestoneType: event.type, audience, toneUsed: instaTone,   openingLine: instagram.split('\n')[0] });
  writeMemory('linkedin',  { date: today, milestoneType: event.type, audience, toneUsed: linkedTone,  openingLine: linkedin.split('\n')[0]  });
  writeMemory('twitter',   { date: today, milestoneType: event.type, audience, toneUsed: twitterTone, openingLine: twitter.split('\n')[0]   });

  return {
    instagram,
    linkedin,
    twitter,
    milestoneType: event.type,
    milestoneMessage: event.message,
    imagePrompt,
    imageStyle,
    audience,
  };
}
