// TEMPORARY: Using Groq (free) while Anthropic credits are topped up.
// To switch back to Claude: swap Groq import/client with Anthropic SDK.
// The prompt structure (system + user) works identically on both.
import Groq from 'groq-sdk';
import { MilestoneEvent, GeneratedPosts } from '../types';
import { ADIRA_SYSTEM_PROMPT } from '../aria/characterCard';
import { readMemory, writeMemory, formatMemoryContext } from '../aria/memory';
import { getAudienceMode, audienceContext } from '../aria/audience';
import dotenv from 'dotenv';
dotenv.config();

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generatePosts(event: MilestoneEvent): Promise<GeneratedPosts> {
  const { data } = event;
  const memory = await readMemory();
  const audience = getAudienceMode();
  const memoryContext = formatMemoryContext(memory);

  const joinersLine = data.recentPublicJoiners.length > 0
    ? `Recent joiners:\n` + data.recentPublicJoiners
        .filter(j => j.city || j.cineGrokUrl)
        .map(j => {
          const handles = [
            j.instagramHandle ? `Instagram: ${j.instagramHandle}` : '',
            j.twitterHandle   ? `Twitter: ${j.twitterHandle}`     : '',
            j.linkedinUrl     ? `LinkedIn: ${j.linkedinUrl}`       : '',
          ].filter(Boolean).join(' | ');
          return `  - ${j.firstName} (${j.primaryRole}${j.city ? ', ' + j.city : ''}) — CineGrok: ${j.cineGrokUrl}${handles ? ' | ' + handles : ''}`;
        }).join('\n')
    : '';

  const roleLines = Object.entries(data.roleBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => `  ${role}: ${count}`)
    .join('\n');

  const userPrompt = `## TODAY'S DATA

Signups:
- Total real filmmakers: ${data.totalRealUsers}
- New today: ${data.newToday} | New this week: ${data.newThisWeek}
- Milestone: ${event.message}
${joinersLine}

Platform reach:
- Cities: ${data.uniqueCities} | States: ${data.uniqueStates}
- Founding members: ${data.foundingMemberCount}
- Active opportunities on CineGrok (festivals, grants): ${data.activeOpportunities}

Profile engagement:
- Total profile views (all time): ${data.totalProfileViews}
- Profile views this week: ${data.weeklyProfileViews}
- Portfolio clicks (all time): ${data.totalProfileClicks}
- Visitors arriving from Instagram this week: ${data.weeklyInstagramReferrals}

Collaboration signals:
- Filmmakers open to collaborations: ${data.openToCollaborations}
- Times a filmmaker was shortlisted by someone: ${data.shortlistedCount}

Community composition:
- Films uploaded across all profiles: ${data.totalFilmsInPortfolios}
- Filmmakers with multiple roles: ${data.multiRoleCount}
${roleLines ? `Role breakdown:\n${roleLines}` : ''}
Top genres: ${data.topGenres.length > 0 ? data.topGenres.join(', ') : 'not yet available'}

## AUDIENCE MODE TODAY
${audienceContext(audience)}

## YOUR RECENT POST HISTORY — do not repeat any tone or opening structure below
${memoryContext}

## WHAT ADIRA SOUNDS LIKE — study these before writing

BAD (do not write like this):
"CineGrok has reached a new milestone! We're excited to welcome new filmmakers from across India to our platform. This is a reminder of the incredible talent in our country."
→ Press release. No point of view. "Excited." "Incredible." Dead words.

GOOD (write like this):
"Bhopal. Nagpur. Patna. Three cities that casting directors have never visited. Three new filmmakers on CineGrok this week — one from each. The industry's map just got bigger, whether the industry noticed or not. #CineGrok #IndianFilmmakers"
→ Specific cities. Real observation. A point of view. Lets the fact do the work.

BAD:
"Every filmmaker has a story. At CineGrok, we believe in supporting the journey of every aspiring filmmaker in India."
→ Generic. Could be any platform. Says nothing real.

GOOD:
"${data.recentPublicJoiners.filter(j => j.city)[0]
  ? `${data.recentPublicJoiners.filter(j => j.city)[0].firstName} is a ${data.recentPublicJoiners.filter(j => j.city)[0].primaryRole} from ${data.recentPublicJoiners.filter(j => j.city)[0].city}. Joined CineGrok today. The industry doesn't know that name yet. It will.`
  : `${data.newToday} filmmaker(s) joined CineGrok today. Real people. Real cities. Real bets on themselves.`}"
→ One person. One city. One sentence with weight.

## BEFORE YOU WRITE

Today's data: ${data.recentPublicJoiners.filter(j => j.city).length > 0
  ? data.recentPublicJoiners.filter(j => j.city).map(j => `${j.firstName} (${j.primaryRole}, ${j.city})`).join(', ')
  : `${data.newToday} new filmmaker(s), ${data.totalRealUsers} total`}.

Find the one human truth in this. A real person in a real city made a real decision today. Start from that. Feel it. Then write.

## YOUR TASK
Write 3 posts — each a completely different emotional angle. Not reformatted versions of the same thought. Three different entries into the same truth.

State the tone in the [TONE] tag.

Format EXACTLY as follows (keep all labels):

[INSTAGRAM]
[TONE: <tone name>]
<2-3 sentences. Emotional, cinematic. Film/camera emojis used naturally. Focus on Social SEO by integrating highly searched keywords naturally into the caption text.
Hashtags (max 3): always #CineGrok + specific city if mentioned + specific role. No generic hashtags.>

[LINKEDIN]
[TONE: <tone name>]
<3-4 sentences. Professional but human. No excessive emojis. End with 2-3 hashtags>

[TWITTER]
[TONE: <tone name>]
<Under 240 characters. One punch. Max 2 hashtags>

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
<Pick one: Cinematic / Moody / Surreal — based on today's tone>

RULES:
- Every post ends with: — ADIRA, CineGrok
- Never mention emails, phone numbers, user IDs, or internal data
- Never use full names — first name only
- Never say: thrilled, excited, proud to announce, journey, ecosystem, game-changer, struggling
- Write like someone who genuinely cares about these filmmakers, not a brand account
- When a joiner has an Instagram handle, tag them in the Instagram post (e.g. @mayapatel)
- When a joiner has a Twitter handle, tag them in the Twitter post
- Always include the filmmaker's CineGrok profile link (e.g. cinegrok.in/filmmakers/maya-patel) in at least one platform's post
- On LinkedIn, include the full LinkedIn URL of the filmmaker if available`;

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: ADIRA_SYSTEM_PROMPT },
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

  const SIG = '\n\n— ADIRA, CineGrok';
  const addSig = (t: string) => t.includes('— ADIRA, CineGrok') ? t : t + SIG;

  // Programmatically inject social handles and CineGrok links — never rely on the model for this
  const joiners = data.recentPublicJoiners;

  const instaHandles = joiners
    .filter(j => j.instagramHandle)
    .map(j => j.instagramHandle!)
    .join(' ');

  const cineGrokLinks = joiners
    .filter(j => j.cineGrokUrl && j.cineGrokUrl !== 'https://cinegrok.in')
    .map(j => j.cineGrokUrl)
    .slice(0, 2) // max 2 profile links per post to keep it clean
    .join('\n');

  const linkedInMentions = joiners
    .filter(j => j.linkedinUrl)
    .map(j => j.linkedinUrl!)
    .join('\n');

  // Build injected suffix for each platform
  const igRaw = instagramMatch?.[1]?.trim() ?? 'Could not generate Instagram post';
  const igSuffix = [
    instaHandles ? instaHandles : '',
    cineGrokLinks,
  ].filter(Boolean).join('\n');

  const liRaw = linkedinMatch?.[1]?.trim() ?? 'Could not generate LinkedIn post';
  const liSuffix = [
    linkedInMentions,
    cineGrokLinks,
  ].filter(Boolean).join('\n');

  const twRaw = twitterMatch?.[1]?.trim() ?? 'Could not generate Twitter post';
  const twSuffix = cineGrokLinks ? cineGrokLinks.split('\n')[0] : ''; // just one link on Twitter

  const instagram = addSig(igSuffix ? `${igRaw}\n${igSuffix}` : igRaw);
  const linkedin  = addSig(liSuffix ? `${liRaw}\n${liSuffix}` : liRaw);
  const twitter   = addSig(twSuffix ? `${twRaw}\n${twSuffix}` : twRaw);
  const imagePrompt = imagePromptMatch?.[1]?.trim() ?? 'Cinematic film set in India, warm golden lighting, filmmaker at work';
  const rawStyle  = imageStyleMatch?.[1]?.trim() ?? 'Cinematic';
  const imageStyle = (['Cinematic', 'Moody', 'Surreal'].includes(rawStyle)
    ? rawStyle
    : 'Cinematic') as 'Cinematic' | 'Moody' | 'Surreal';

  const today = new Date().toISOString().split('T')[0];

  // Write to memory per platform
  await writeMemory('instagram', { date: today, milestoneType: event.type, audience, toneUsed: instaTone,   openingLine: instagram.split('\n')[0] });
  await writeMemory('linkedin',  { date: today, milestoneType: event.type, audience, toneUsed: linkedTone,  openingLine: linkedin.split('\n')[0]  });
  await writeMemory('twitter',   { date: today, milestoneType: event.type, audience, toneUsed: twitterTone, openingLine: twitter.split('\n')[0]   });

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
