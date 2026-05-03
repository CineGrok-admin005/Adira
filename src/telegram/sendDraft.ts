import { bot } from './bot';
import { GeneratedPosts, CommentaryPost } from '../types';

import dotenv from 'dotenv';
dotenv.config();

// Escape for Telegram HTML mode
function h(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const CHARACTER_LOCK = `
STRICT CHARACTER LOCK:
Use uploaded ADIRA reference image.
Treat ADIRA as a persistent character.
Do not redesign face.
Do not reinterpret facial anatomy.
Preserve exact identity.

CAN CHANGE: clothes, hairstyle, pose, environment
CANNOT CHANGE: face structure, eyes, jawline, skin tone, core identity

STYLE: Editorial illustration — Graphic novel × Indian cinema poster
FORMAT: Square 1:1 | No text | Cinematic composition | High detail`;

const AUDIENCE_LABEL: Record<string, string> = {
  general:   '🌐 General',
  filmmaker: '🎬 Filmmaker',
  industry:  '🏢 Industry',
};


export async function sendDraftToFounder(posts: GeneratedPosts): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const audience = AUDIENCE_LABEL[posts.audience] ?? posts.audience;
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const html = { parse_mode: 'HTML' as const };

  await bot.sendMessage(chatId, `🎙️ <b>ADIRA — CineGrok Daily Report</b>\n<i>Audience: ${audience} | ${time}</i>\n<i>Milestone: ${h(posts.milestoneMessage)}</i>`, html);
  await bot.sendMessage(chatId, `📸 <b>INSTAGRAM</b>\n\n${h(posts.instagram)}`, html);
  await bot.sendMessage(chatId, `💼 <b>LINKEDIN</b>\n\n${h(posts.linkedin)}`, html);
  await bot.sendMessage(chatId, `🐦 <b>TWITTER / X</b>\n\n${h(posts.twitter)}`, html);
  if (posts.imageBuffer) {
    // Telegram photo caption limit is 1024 chars — send image first, prompt as follow-up
    await bot.sendPhoto(chatId, posts.imageBuffer, { caption: `🎨 ADIRA image — ${posts.imageStyle} | ${posts.emotion ?? 'thoughtful'}`, parse_mode: 'HTML' });
    await bot.sendMessage(chatId, `🎨 <b>IMAGE PROMPT</b> — ${posts.imageStyle}\n\nUpload adira-avatar.png to ChatGPT with this prompt:\n\n${h(posts.imagePrompt)}\n\n${h(CHARACTER_LOCK)}`, html);
  } else {
    await bot.sendMessage(chatId, `🎨 <b>IMAGE PROMPT</b> — ${posts.imageStyle}\n\nUpload adira-avatar.png to ChatGPT with this prompt:\n\n${h(posts.imagePrompt)}\n\n${h(CHARACTER_LOCK)}`, html);
  }

  if (posts.instagramBrief) {
    await bot.sendMessage(chatId, `📋 <b>INSTAGRAM BRIEF — paste into Claude.ai project</b>\n\n<code>${h(posts.instagramBrief)}</code>`, html);
  }

  console.log('✅ Draft sent to Telegram successfully');
}

export async function sendCommentaryDraft(post: CommentaryPost): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const audience = AUDIENCE_LABEL[post.audience] ?? post.audience;
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const sources = post.sourceStory.newsSources.join(', ') || 'Indian press';

  // Message 1: header + source story
  await bot.sendMessage(chatId,
    `🎙️ <b>ADIRA — Commentary Post</b>\n<i>Audience: ${audience} | ${time}</i>\n\n🔗 <b>SOURCE STORY</b>\n"${h(post.sourceStory.title)}"\n${post.sourceStory.url}\n<i>Also covered by: ${h(sources)}</i>`,
    { parse_mode: 'HTML' }
  );

  // Message 2-4: one per platform (each independently copyable on mobile)
  await bot.sendMessage(chatId, `📸 <b>INSTAGRAM</b>\n\n${h(post.instagram)}`, { parse_mode: 'HTML' });
  await bot.sendMessage(chatId, `💼 <b>LINKEDIN</b>\n\n${h(post.linkedin)}`,   { parse_mode: 'HTML' });
  await bot.sendMessage(chatId, `🐦 <b>TWITTER / X</b>\n\n${h(post.twitter)}`, { parse_mode: 'HTML' });

  // Message 5: image prompt or actual image
  if (post.imageBuffer) {
    await bot.sendPhoto(chatId, post.imageBuffer, { caption: `🎨 <b>IMAGE PROMPT</b> — ${post.imageStyle}\n\n${h(post.imagePrompt)}`, parse_mode: 'HTML' });
  } else {
    await bot.sendMessage(chatId,
      `🎨 <b>IMAGE PROMPT</b> — ${post.imageStyle}\n\nUpload adira-avatar.png to ChatGPT with this prompt:\n\n${h(post.imagePrompt)}\n\n${h(CHARACTER_LOCK)}`,
      { parse_mode: 'HTML' }
    );
  }

  if (post.instagramBrief) {
    await bot.sendMessage(chatId, `📋 <b>INSTAGRAM BRIEF — paste into Claude.ai project</b>\n\n<code>${h(post.instagramBrief)}</code>`, { parse_mode: 'HTML' });
  }

  console.log('✅ Commentary draft sent to Telegram');
}

export async function sendIntroductionToFounder(posts: GeneratedPosts): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const html = { parse_mode: 'HTML' as const };

  await bot.sendMessage(chatId, `🎙️ <b>ADIRA — Launch Post</b>\n<i>Review and publish manually on all platforms.\nAfter posting, set ADIRA_INTRODUCED=true in .env</i>`, html);
  await bot.sendMessage(chatId, `📸 <b>INSTAGRAM</b>\n\n${h(posts.instagram)}`, html);
  await bot.sendMessage(chatId, `💼 <b>LINKEDIN</b>\n\n${h(posts.linkedin)}`, html);
  await bot.sendMessage(chatId, `🐦 <b>TWITTER / X</b>\n\n${h(posts.twitter)}`, html);
  await bot.sendMessage(chatId, `🎨 <b>IMAGE PROMPT</b> — ${posts.imageStyle}\n\n${h(posts.imagePrompt)}`, html);

  console.log('✅ ADIRA launch post sent to Telegram');
}
