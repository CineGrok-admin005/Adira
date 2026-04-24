import { bot } from './bot';
import { GeneratedPosts, CommentaryPost } from '../types';

import dotenv from 'dotenv';
dotenv.config();

// Escape for Telegram HTML mode
function h(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const AUDIENCE_LABEL: Record<string, string> = {
  general:   '🌐 General',
  filmmaker: '🎬 Filmmaker',
  industry:  '🏢 Industry',
};

async function send(chatId: string, text: string, html = false): Promise<void> {
  await bot.sendMessage(chatId, text, html ? { parse_mode: 'HTML' } : { parse_mode: 'Markdown' });
}

export async function sendDraftToFounder(posts: GeneratedPosts): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const audience = AUDIENCE_LABEL[posts.audience] ?? posts.audience;
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Message 1: header
  await send(chatId, `🎙️ *ADIRA — CineGrok Daily Report*\n_Audience: ${audience} | ${time}_\n_Milestone: ${posts.milestoneMessage}_`);

  // Message 2-4: one per platform (easy to copy individually on mobile)
  await send(chatId, `📸 *INSTAGRAM*\n\n${posts.instagram}`);
  await send(chatId, `💼 *LINKEDIN*\n\n${posts.linkedin}`);
  await send(chatId, `🐦 *TWITTER / X*\n\n${posts.twitter}`);

  // Message 5: image prompt
  await send(chatId, `🎨 *IMAGE PROMPT* — ${posts.imageStyle}\n\n${posts.imagePrompt}`);

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

  // Message 5: image prompt
  await bot.sendMessage(chatId,
    `🎨 <b>IMAGE PROMPT</b> — ${post.imageStyle}\n\n${h(post.imagePrompt)}`,
    { parse_mode: 'HTML' }
  );

  console.log('✅ Commentary draft sent to Telegram');
}

export async function sendIntroductionToFounder(posts: GeneratedPosts): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  await send(chatId, `🎙️ *ADIRA — Launch Post*\n_This is ADIRA's first post\\. Review and publish manually on all platforms\\._\n_After posting, set ADIRA\\_INTRODUCED=true in \\.env_`);
  await send(chatId, `📸 *INSTAGRAM*\n\n${posts.instagram}`);
  await send(chatId, `💼 *LINKEDIN*\n\n${posts.linkedin}`);
  await send(chatId, `🐦 *TWITTER / X*\n\n${posts.twitter}`);
  await send(chatId, `🎨 *IMAGE PROMPT* — ${posts.imageStyle}\n\n${posts.imagePrompt}`);

  console.log('✅ ADIRA launch post sent to Telegram');
}
