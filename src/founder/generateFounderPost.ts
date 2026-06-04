import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

import { SIVAJI_SYSTEM_PROMPT } from './voiceCard';
import { fetchGrowthData } from '../supabase/queries';
import { sanitizeForPublic } from '../privacy/sanitize';
import { fetchGoogleNews } from '../news/fetchGoogleNews';
import { GrowthData, FounderPost, FounderTopic, NewsItem } from '../types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TOPICS: FounderTopic[] = ['BUILD_IN_PUBLIC', 'FILMMAKER_STORY', 'INDUSTRY_TAKE', 'MILESTONES'];

const TOPIC_LABEL: Record<FounderTopic, string> = {
  BUILD_IN_PUBLIC: 'Build in public',
  FILMMAKER_STORY: 'Filmmaker story',
  INDUSTRY_TAKE: 'Industry take',
  MILESTONES: 'Milestones & numbers',
};

// Deterministic rotation by date — no persistent state needed in stateless CI.
// Cadence (every ~2 days) is controlled by the cron schedule that triggers this.
export function pickFounderTopic(date = new Date()): FounderTopic {
  const epochDays = Math.floor(date.getTime() / 86_400_000);
  return TOPICS[Math.floor(epochDays / 2) % TOPICS.length];
}

function materialFromGrowth(d: GrowthData): string {
  const roles = Object.entries(d.roleBreakdown || {})
    .map(([role, n]) => `${role}: ${n}`)
    .join(', ');
  const joiners = (d.recentPublicJoiners || [])
    .slice(0, 5)
    .map(j => `${j.firstName} — ${j.primaryRole}, ${j.city}, ${j.state}${j.instagramHandle ? ` (IG ${j.instagramHandle})` : ''}`)
    .join('\n  ');

  return `- Filmmakers on the platform: ${d.totalRealUsers}
- New this week: ${d.newThisWeek} | new today: ${d.newToday}
- Cities: ${d.uniqueCities} across ${d.uniqueStates} states
- Films in portfolios: ${d.totalFilmsInPortfolios}
- Open to collaborations: ${d.openToCollaborations}
- Founding members: ${d.foundingMemberCount}
- Profile views (total / this week): ${d.totalProfileViews} / ${d.weeklyProfileViews}
- Role mix: ${roles || 'n/a'}
- Top genres: ${(d.topGenres || []).join(', ') || 'n/a'}
- Recent joiners:
  ${joiners || '(none this period)'}`;
}

function topicGuidance(topic: FounderTopic, news: NewsItem[]): string {
  switch (topic) {
    case 'BUILD_IN_PUBLIC':
      return `TOPIC: Build in public. Share one real, specific thing about building CineGrok right now — a decision you made, something that's harder than expected, something you changed your mind about, or what this week's numbers actually feel like from the inside. Honest middle, not a highlight reel.`;
    case 'FILMMAKER_STORY':
      return `TOPIC: Filmmaker story. Pick ONE real filmmaker from the recent joiners and write about why someone like them is the whole reason CineGrok exists — their role, their city, what it means that they're building before anyone's watching. Use first name + city + role only. Tag their handle if provided.`;
    case 'INDUSTRY_TAKE':
      return `TOPIC: Industry take. ${news.length > 0
        ? `React to something real happening in Indian cinema right now. Relevant headlines:\n${news.slice(0, 4).map(n => `   • "${n.title}"${n.source ? ` (${n.source})` : ''}`).join('\n')}\nGive YOUR opinion as a founder — connect it to gatekeeping and the people CineGrok is built for. Only use facts you can stand behind.`
        : `Give your honest founder opinion on how the Indian film industry treats people at the start — gatekeeping, the lack of a way in, why you built CineGrok as the answer. No invented news.`}`;
    case 'MILESTONES':
      return `TOPIC: Milestones & numbers. Take the most meaningful number from the data and say what it actually means to you as the founder — not a celebration, an observation. What does this number represent in real human terms?`;
  }
}

function ensureSig(text: string): string {
  return text.includes('— Sivaji, CineGrok') ? text : `${text.trim()}\n\n— Sivaji, CineGrok`;
}

export async function generateFounderPost(): Promise<FounderPost | null> {
  const topic = pickFounderTopic();
  console.log(`   Founder topic today: ${TOPIC_LABEL[topic]}`);

  let safe: GrowthData;
  try {
    safe = sanitizeForPublic(await fetchGrowthData());
  } catch (err) {
    console.error('❌ Founder: could not fetch/sanitize growth data:', (err as Error).message);
    return null;
  }

  let news: NewsItem[] = [];
  if (topic === 'INDUSTRY_TAKE') {
    try { news = await fetchGoogleNews(); }
    catch (err) { console.warn('⚠️  Founder: news fetch failed, writing opinion without headlines:', (err as Error).message); }
  }

  const material = materialFromGrowth(safe);

  const prompt = `${topicGuidance(topic, news)}

## TODAY'S REAL MATERIAL (use only these facts — never invent numbers or names)
${material}

## YOUR TASK
Write Sivaji's founder post for today's topic, in three platform versions. First person, honest, specific. No press-release tone.

Format EXACTLY (keep the labels):

[LINKEDIN]
3-6 short lines. Strong first line that stands alone before the "see more" fold (~210 chars). Build in public, specific, human. Do NOT put any link/URL in the text — the link goes in the first comment. End with one genuine question that invites a real reply.

[TWITTER]
Under 260 characters total. One sharp founder thought. 0-2 hashtags only if they earn it.

[INSTAGRAM]
2-4 sentences. Personal and specific. The first line carries the keyword. 3-5 hashtags at the very end: always #CineGrok + specific niche tags (e.g. #IndieFilmIndia #IndianFilmmakers + city/role if relevant).

[ANGLE]
One line: the single sharpest version of today's point (used to brief a longer carousel later).`;

  let text = '';
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1100,
      messages: [
        { role: 'system', content: SIVAJI_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });
    text = response.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.error('❌ Founder: Groq generation failed:', (err as Error).message);
    return null;
  }

  const linkedinMatch  = text.match(/\[LINKEDIN\]\s*([\s\S]*?)(?=\[TWITTER\])/);
  const twitterMatch   = text.match(/\[TWITTER\]\s*([\s\S]*?)(?=\[INSTAGRAM\])/);
  const instagramMatch = text.match(/\[INSTAGRAM\]\s*([\s\S]*?)(?=\[ANGLE\]|$)/);
  const angleMatch     = text.match(/\[ANGLE\]\s*([\s\S]*?)$/);

  if (!linkedinMatch?.[1] || !twitterMatch?.[1] || !instagramMatch?.[1]) {
    console.error('❌ generateFounderPost: failed to parse posts from response');
    return null;
  }

  // Strip any stray bracket labels and any link the model wrote into the LinkedIn body
  const stripTags = (t: string) => (t ?? '').replace(/\[[A-Z][A-Z_ ]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

  const linkedin = ensureSig(
    stripTags(linkedinMatch[1])
      .replace(/https?:\/\/(www\.)?cinegrok\.in\/?\S*/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
  const twitter   = ensureSig(stripTags(twitterMatch[1]));
  const instagram = ensureSig(stripTags(instagramMatch[1]));
  const angle = stripTags(angleMatch?.[1] ?? '').split('\n')[0] || TOPIC_LABEL[topic];

  const claudeBrief = `FOUNDER POST — paste into the Sivaji Claude project

VOICE: Sivaji (founder, first person). NOT ADIRA.
TOPIC: ${TOPIC_LABEL[topic]}
CORE ANGLE: ${angle}

REAL MATERIAL (use only these facts; verify any film/person/news before using):
${material}

WANT: a polished LinkedIn post (no link in body — link goes in first comment), a Twitter/X post, and an Instagram caption — all first person, honest, specific, ending with "— Sivaji, CineGrok".`;

  return { topic, linkedin, twitter, instagram, claudeBrief };
}
