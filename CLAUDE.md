# CineGrok Growth Agent — Claude Code Build Instructions

## What You Are Building
An automated AI agent for CineGrok (cinegrok.in) that:
1. Runs every morning at 8 AM IST via a cron job
2. Queries Supabase for growth milestones (new signups, first-of-a-kind profiles, weekly counts)
3. Sanitizes data (removes all private/sensitive fields)
4. Sends sanitized data to Claude API to generate 3 platform-specific posts
5. Sends drafts to a Telegram bot for founder review
6. On approval, posts to Instagram, LinkedIn, and Twitter/X

## Tech Stack
- Runtime: Node.js 18+
- Language: TypeScript
- Scheduler: node-cron
- Database: Supabase (existing project)
- AI Writer: Anthropic Claude API (claude-sonnet-4-20250514)
- Review Inbox: Telegram Bot API
- Social Posting: Meta Graph API (Instagram), LinkedIn UGC API, Twitter/X API v2
- Hosting: Railway.app (free tier) — NOT Vercel (Vercel is serverless, can't run cron jobs persistently)
- Environment: .env file for all secrets

---

## Step 1 — Project Scaffold

Create this exact folder structure:

```
cinegrok-growth-agent/
├── src/
│   ├── index.ts                  # Entry point, starts cron job
│   ├── scheduler.ts              # Cron job definition (8 AM IST daily)
│   ├── supabase/
│   │   ├── client.ts             # Supabase client init
│   │   └── queries.ts            # Growth data queries
│   ├── privacy/
│   │   └── sanitize.ts           # Data sanitization before Claude
│   ├── claude/
│   │   └── generatePosts.ts      # Claude API call + prompt
│   ├── telegram/
│   │   ├── bot.ts                # Telegram bot setup
│   │   └── sendDraft.ts          # Send draft posts to founder
│   ├── social/
│   │   ├── twitter.ts            # Post to Twitter/X
│   │   ├── linkedin.ts           # Post to LinkedIn
│   │   └── instagram.ts          # Post to Instagram
│   ├── milestones/
│   │   └── detector.ts           # Milestone detection logic
│   └── types/
│       └── index.ts              # Shared TypeScript types
├── .env.example                  # Template for env vars (no real values)
├── .env                          # Real secrets (gitignored)
├── .gitignore
├── package.json
├── tsconfig.json
├── railway.toml                  # Railway deployment config
└── README.md
```

---

## Step 2 — package.json

Create package.json with these exact dependencies:

```json
{
  "name": "cinegrok-growth-agent",
  "version": "1.0.0",
  "description": "Automated growth posting agent for CineGrok",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "test:run": "ts-node src/index.ts --test"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",
    "@supabase/supabase-js": "^2.39.0",
    "node-cron": "^3.0.3",
    "node-telegram-bot-api": "^0.65.1",
    "twitter-api-v2": "^1.17.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/node-cron": "^3.0.0",
    "@types/node-telegram-bot-api": "^0.64.0",
    "typescript": "^5.3.0",
    "ts-node": "^10.9.0"
  }
}
```

---

## Step 3 — TypeScript Types (src/types/index.ts)

```typescript
export interface GrowthData {
  totalUsers: number;
  newToday: number;
  newThisWeek: number;
  recentPublicJoiners: PublicJoiner[];
  firstFemaleFilmmaker: PublicJoiner | null;
  firstFromNewCity: PublicJoiner | null;
  milestoneHit: number | null;
}

export interface PublicJoiner {
  firstName: string;
  role: string;
  city: string;
  state: string;
}

export interface GeneratedPosts {
  instagram: string;
  linkedin: string;
  twitter: string;
  milestoneType: string;
  milestoneMessage: string;
}

export interface MilestoneEvent {
  hasMilestone: boolean;
  type: 'COUNT_MILESTONE' | 'FIRST_FEMALE' | 'FIRST_NEW_CITY' | 'DAILY_UPDATE' | 'WEEKLY_SUMMARY' | 'NONE';
  message: string;
  data: GrowthData;
}
```

---

## Step 4 — Environment Variables

Create .env.example (commit this to git):

```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-personal-chat-id

# Twitter/X API
TWITTER_API_KEY=your-api-key
TWITTER_API_SECRET=your-api-secret
TWITTER_ACCESS_TOKEN=your-access-token
TWITTER_ACCESS_SECRET=your-access-secret

# LinkedIn
LINKEDIN_ACCESS_TOKEN=your-linkedin-token
LINKEDIN_ORGANIZATION_ID=your-org-id

# Instagram / Meta
INSTAGRAM_ACCOUNT_ID=your-instagram-account-id
META_PAGE_ACCESS_TOKEN=your-page-access-token

# App Config
NODE_ENV=production
TIMEZONE=Asia/Kolkata
TEST_MODE=false
```

Create .gitignore:

```
.env
node_modules/
dist/
*.log
```

---

## Step 5 — Supabase Client (src/supabase/client.ts)

```typescript
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
```

---

## Step 6 — Supabase Queries (src/supabase/queries.ts)

```typescript
import { supabase } from './client';
import { GrowthData, PublicJoiner } from '../types';

export async function fetchGrowthData(): Promise<GrowthData> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Total public users
  const { count: totalUsers } = await supabase
    .from('profiles')          // ← CHANGE THIS to your actual users/profiles table name
    .select('*', { count: 'exact', head: true })
    .eq('is_public', true);

  // New today
  const { count: newToday } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_public', true)
    .gte('created_at', oneDayAgo);

  // New this week
  const { count: newThisWeek } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_public', true)
    .gte('created_at', oneWeekAgo);

  // Recent public joiners — only safe public fields
  const { data: recentRaw } = await supabase
    .from('profiles')
    .select('first_name, role, city, state')  // ← ONLY these fields
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentPublicJoiners: PublicJoiner[] = (recentRaw || []).map(u => ({
    firstName: u.first_name,
    role: u.role,
    city: u.city,
    state: u.state,
  }));

  // First female filmmaker
  const { data: femaleData } = await supabase
    .from('profiles')
    .select('first_name, role, city, state, created_at')
    .eq('is_public', true)
    .eq('gender', 'female')    // ← adjust field name if different
    .order('created_at', { ascending: true })
    .limit(1);

  const firstFemaleFilmmaker = femaleData && femaleData.length > 0 ? {
    firstName: femaleData[0].first_name,
    role: femaleData[0].role,
    city: femaleData[0].city,
    state: femaleData[0].state,
  } : null;

  // First filmmaker from a new city (joined in last 24h, city not seen before)
  const { data: newCityData } = await supabase
    .from('profiles')
    .select('first_name, role, city, state')
    .eq('is_public', true)
    .gte('created_at', oneDayAgo)
    .not('city', 'is', null)
    .limit(10);

  // Check if any of today's cities are brand new to the platform
  let firstFromNewCity: PublicJoiner | null = null;
  if (newCityData && newCityData.length > 0) {
    for (const joiner of newCityData) {
      const { count: cityCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_public', true)
        .eq('city', joiner.city);

      if (cityCount === 1) {
        firstFromNewCity = {
          firstName: joiner.first_name,
          role: joiner.role,
          city: joiner.city,
          state: joiner.state,
        };
        break;
      }
    }
  }

  // Check for count milestones
  const MILESTONE_NUMBERS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  const total = totalUsers || 0;
  const newT = newToday || 0;
  const milestoneHit = MILESTONE_NUMBERS.find(
    m => total >= m && total - newT < m
  ) || null;

  return {
    totalUsers: total,
    newToday: newT,
    newThisWeek: newThisWeek || 0,
    recentPublicJoiners,
    firstFemaleFilmmaker,
    firstFromNewCity,
    milestoneHit,
  };
}
```

> NOTE TO CLAUDE CODE: After creating this file, ask the user:
> "What is your actual Supabase profiles/users table name? And what are the column names for: first_name, role, city, state, gender, is_public, created_at?"
> Then update the table name and column names accordingly.

---

## Step 7 — Milestone Detector (src/milestones/detector.ts)

```typescript
import { GrowthData, MilestoneEvent } from '../types';

export function detectMilestone(data: GrowthData): MilestoneEvent {

  // Priority 1: Big count milestone (e.g. first 100 users)
  if (data.milestoneHit) {
    return {
      hasMilestone: true,
      type: 'COUNT_MILESTONE',
      message: `CineGrok just crossed ${data.milestoneHit} filmmakers on the platform!`,
      data
    };
  }

  // Priority 2: First female filmmaker
  if (data.firstFemaleFilmmaker && data.newToday > 0) {
    const f = data.firstFemaleFilmmaker;
    return {
      hasMilestone: true,
      type: 'FIRST_FEMALE',
      message: `First female filmmaker on CineGrok: a ${f.role} from ${f.city}, ${f.state}.`,
      data
    };
  }

  // Priority 3: First from a new city
  if (data.firstFromNewCity) {
    const c = data.firstFromNewCity;
    return {
      hasMilestone: true,
      type: 'FIRST_NEW_CITY',
      message: `CineGrok just reached ${c.city}, ${c.state} for the first time — a ${c.role} joined!`,
      data
    };
  }

  // Priority 4: Daily update (any new joiners today)
  if (data.newToday > 0) {
    return {
      hasMilestone: true,
      type: 'DAILY_UPDATE',
      message: `${data.newToday} new filmmaker(s) joined CineGrok today. Total: ${data.totalUsers}.`,
      data
    };
  }

  // Priority 5: Weekly summary (even if quiet day)
  const today = new Date().getDay();
  if (today === 1 && data.newThisWeek > 0) { // Monday
    return {
      hasMilestone: true,
      type: 'WEEKLY_SUMMARY',
      message: `${data.newThisWeek} filmmakers joined CineGrok this week. Community growing!`,
      data
    };
  }

  return { hasMilestone: false, type: 'NONE', message: '', data };
}
```

---

## Step 8 — Privacy Sanitizer (src/privacy/sanitize.ts)

```typescript
import { GrowthData } from '../types';

// CRITICAL: This runs before ANY data reaches Claude or social media
// Whitelist approach — only explicitly allowed fields pass through
export function sanitizeForPublic(data: GrowthData): GrowthData {
  const safe: GrowthData = {
    totalUsers: data.totalUsers,
    newToday: data.newToday,
    newThisWeek: data.newThisWeek,
    milestoneHit: data.milestoneHit,

    recentPublicJoiners: data.recentPublicJoiners.map(u => ({
      firstName: u.firstName,    // Public: first name only
      role: u.role,              // Public: role
      city: u.city,              // Public: city
      state: u.state,            // Public: state
      // NEVER: email, phone, userId, lastName, privateNotes
    })),

    firstFemaleFilmmaker: data.firstFemaleFilmmaker ? {
      firstName: data.firstFemaleFilmmaker.firstName,
      role: data.firstFemaleFilmmaker.role,
      city: data.firstFemaleFilmmaker.city,
      state: data.firstFemaleFilmmaker.state,
    } : null,

    firstFromNewCity: data.firstFromNewCity ? {
      firstName: data.firstFromNewCity.firstName,
      role: data.firstFromNewCity.role,
      city: data.firstFromNewCity.city,
      state: data.firstFromNewCity.state,
    } : null,
  };

  // Final safety scan — catch anything that looks like PII
  const safeString = JSON.stringify(safe);
  const forbidden = ['@gmail', '@yahoo', '@hotmail', '.com', 'password', 'token', 'secret'];
  for (const pattern of forbidden) {
    if (safeString.toLowerCase().includes(pattern)) {
      throw new Error(`PRIVACY GUARD: Detected forbidden pattern "${pattern}" in data before Claude call. Aborting.`);
    }
  }

  return safe;
}
```

---

## Step 9 — Claude Post Generator (src/claude/generatePosts.ts)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { MilestoneEvent, GeneratedPosts } from '../types';
import dotenv from 'dotenv';
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generatePosts(event: MilestoneEvent): Promise<GeneratedPosts> {
  const { data } = event;

  const prompt = `You are CineGrok's marketing voice. CineGrok (cinegrok.in) is a platform for emerging filmmakers in India to build their professional identity, showcase their work, and connect with collaborators. It is the LinkedIn for Indian cinema.

Today's growth snapshot:
- Total filmmakers on platform: ${data.totalUsers}
- New joiners today: ${data.newToday}
- New joiners this week: ${data.newThisWeek}
- Milestone event: ${event.message}
${data.recentPublicJoiners.length > 0 ? `- Recent joiners include: ${data.recentPublicJoiners.map(j => `${j.firstName} (${j.role}, ${j.city})`).join(', ')}` : ''}

Write 3 social media posts celebrating this milestone. Each must feel genuine, warm, founder-led, and community-driven — never corporate or generic.

Format your response EXACTLY like this (keep the labels):

[INSTAGRAM]
Write 2-3 sentences. Emotional and cinematic tone. Use relevant film/camera emojis naturally (not forced). End with 4-5 hashtags: always include #CineGrok, plus relevant ones like #IndianFilmmakers #EmergingFilmmakers #IndieFilm #FilmCommunity

[LINKEDIN]
Write 3-4 sentences. Professional but human. Talk about the ecosystem being built for Indian cinema. Mention the specific milestone. No excessive emojis. End with 2-3 hashtags.

[TWITTER]
Under 240 characters. One punchy hook. The milestone number. Max 2 hashtags. No fluff.

CRITICAL RULES — follow strictly:
- NEVER mention email addresses, phone numbers, user IDs, or any internal data
- NEVER reference any filmmaker unless their profile is explicitly marked public
- NEVER share revenue, investor, or financial information
- NEVER use last names unless the person is a known public figure
- Only reference: milestone numbers, first names, roles (director/actor/editor etc), city names
- Write like a passionate indie film lover who built this platform, not a startup press release
- Keep it real, not salesy`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse the 3 posts
  const instagramMatch = text.match(/\[INSTAGRAM\]\n([\s\S]*?)(?=\[LINKEDIN\])/);
  const linkedinMatch = text.match(/\[LINKEDIN\]\n([\s\S]*?)(?=\[TWITTER\])/);
  const twitterMatch = text.match(/\[TWITTER\]\n([\s\S]*?)$/);

  return {
    instagram: instagramMatch?.[1]?.trim() || 'Could not generate Instagram post',
    linkedin: linkedinMatch?.[1]?.trim() || 'Could not generate LinkedIn post',
    twitter: twitterMatch?.[1]?.trim() || 'Could not generate Twitter post',
    milestoneType: event.type,
    milestoneMessage: event.message,
  };
}
```

---

## Step 10 — Telegram Bot (src/telegram/bot.ts and sendDraft.ts)

### bot.ts
```typescript
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
dotenv.config();

export const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {
  polling: process.env.NODE_ENV === 'development'
});
```

### sendDraft.ts
```typescript
import { bot } from './bot';
import { GeneratedPosts } from '../types';
import dotenv from 'dotenv';
dotenv.config();

export async function sendDraftToFounder(posts: GeneratedPosts): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  const message = `🎬 *CineGrok Growth Post — Daily Draft*
_Review and copy what you want to post_

━━━━━━━━━━━━━━━━━━
📸 *INSTAGRAM*
${posts.instagram}

━━━━━━━━━━━━━━━━━━
💼 *LINKEDIN*
${posts.linkedin}

━━━━━━━━━━━━━━━━━━
🐦 *TWITTER / X*
${posts.twitter}

━━━━━━━━━━━━━━━━━━
_Milestone: ${posts.milestoneMessage}_
_Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}_`;

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  console.log('✅ Draft sent to Telegram successfully');
}
```

---

## Step 11 — Social Media Posters

### src/social/twitter.ts
```typescript
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
dotenv.config();

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

export async function postToTwitter(text: string): Promise<void> {
  const rwClient = client.readWrite;
  await rwClient.v2.tweet(text);
  console.log('✅ Posted to Twitter/X');
}
```

### src/social/linkedin.ts
```typescript
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function postToLinkedIn(text: string): Promise<void> {
  const orgId = process.env.LINKEDIN_ORGANIZATION_ID!;
  const token = process.env.LINKEDIN_ACCESS_TOKEN!;

  await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author: `urn:li:organization:${orgId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );
  console.log('✅ Posted to LinkedIn');
}
```

### src/social/instagram.ts
```typescript
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function postToInstagram(caption: string): Promise<void> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID!;
  const token = process.env.META_PAGE_ACCESS_TOKEN!;
  const baseUrl = `https://graph.facebook.com/v19.0`;

  // Step 1: Create media container (text-only post)
  const containerRes = await axios.post(`${baseUrl}/${accountId}/media`, {
    caption,
    media_type: 'REELS', // Use REELS for text-only or swap for image posts
    access_token: token,
  });

  const containerId = containerRes.data.id;

  // Step 2: Publish
  await axios.post(`${baseUrl}/${accountId}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });

  console.log('✅ Posted to Instagram');
}
```

> NOTE TO CLAUDE CODE: Instagram Graph API requires a media URL for image posts.
> For text-only posts, advise the user to either:
> a) Generate a simple image with the post text using a template, OR
> b) Skip Instagram automation initially and post manually after Telegram review.

---

## Step 12 — Scheduler (src/scheduler.ts)

```typescript
import cron from 'node-cron';
import { runGrowthAgent } from './index';

// Run every day at 8:00 AM IST (IST = UTC+5:30, so 8 AM IST = 2:30 AM UTC)
export function startScheduler(): void {
  cron.schedule('30 2 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Running CineGrok Growth Agent...`);
    await runGrowthAgent();
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('📅 Scheduler started — agent will run daily at 8:00 AM IST');
}
```

---

## Step 13 — Main Entry Point (src/index.ts)

```typescript
import dotenv from 'dotenv';
dotenv.config();

import { fetchGrowthData } from './supabase/queries';
import { sanitizeForPublic } from './privacy/sanitize';
import { detectMilestone } from './milestones/detector';
import { generatePosts } from './claude/generatePosts';
import { sendDraftToFounder } from './telegram/sendDraft';
import { startScheduler } from './scheduler';

export async function runGrowthAgent(): Promise<void> {
  try {
    console.log('🎬 CineGrok Growth Agent starting...');

    // 1. Fetch raw growth data from Supabase
    console.log('📊 Fetching growth data...');
    const rawData = await fetchGrowthData();

    // 2. Sanitize — remove all private/sensitive fields
    console.log('🔒 Sanitizing data...');
    const safeData = sanitizeForPublic(rawData);

    // 3. Detect if there's a milestone worth posting about
    console.log('🎯 Detecting milestones...');
    const milestone = detectMilestone(safeData);

    if (!milestone.hasMilestone) {
      console.log('💤 No milestone today. Agent going back to sleep.');
      return;
    }

    console.log(`🎉 Milestone found: ${milestone.type} — ${milestone.message}`);

    // 4. Generate posts via Claude API
    console.log('✍️  Generating posts with Claude...');
    const posts = await generatePosts(milestone);

    // 5. Send drafts to founder via Telegram
    console.log('📱 Sending drafts to Telegram...');
    await sendDraftToFounder(posts);

    // 6. Optional: Auto-post (comment out if you want manual review only)
    // Uncomment these when you're ready for full automation:
    // await postToTwitter(posts.twitter);
    // await postToLinkedIn(posts.linkedin);
    // await postToInstagram(posts.instagram);

    console.log('✅ CineGrok Growth Agent completed successfully!');

  } catch (error) {
    console.error('❌ Growth Agent error:', error);
    // Optionally notify yourself of errors via Telegram
  }
}

// If running with --test flag, run once immediately
const isTestRun = process.argv.includes('--test');

if (isTestRun) {
  console.log('🧪 TEST MODE — Running agent once immediately...');
  runGrowthAgent();
} else {
  startScheduler();
}
```

---

## Step 14 — tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Step 15 — Railway Config (railway.toml)

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

---

## Step 16 — README.md

```markdown
# CineGrok Growth Agent

Automated AI growth posting agent for CineGrok.

## Setup

1. Clone this repo
2. Copy `.env.example` to `.env` and fill in all values
3. Run `npm install`
4. Test locally: `npm run dev -- --test`
5. Deploy to Railway: push to GitHub, connect repo in Railway dashboard

## How It Works

Runs daily at 8 AM IST → checks Supabase for milestones → 
sanitizes data → Claude writes posts → sends to Telegram for review → 
you approve → posts go live.

## Environment Variables

See `.env.example` for all required variables.

## Local Test

npm run dev -- --test

## Deploy

Push to GitHub → Railway auto-deploys on every push.
```

---

## Instructions for Claude Code After Creating All Files

1. Run `npm install` to install all dependencies
2. Ask the user for their actual Supabase table and column names — update queries.ts
3. Verify the .env file exists with all keys filled in
4. Run `npm run dev -- --test` to test the full pipeline once
5. Check for TypeScript errors with `npx tsc --noEmit`
6. If test is successful, commit to GitHub
7. Guide user to connect the GitHub repo to Railway.app for deployment

## Important Notes for Claude Code

- The social media auto-posting lines in index.ts are COMMENTED OUT by default
- This is intentional — the founder reviews on Telegram first
- Only uncomment those lines when the founder explicitly says they're ready for full automation
- Never hardcode API keys — always use process.env
- The privacy sanitizer in sanitize.ts MUST run before every Claude API call — never bypass it
- If Supabase table names are unknown, ask the user before writing queries.ts
```
