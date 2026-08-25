import dotenv from 'dotenv';
dotenv.config();

import { serviceClient } from '../supabase/client';

// Dead-man's switch.
//
// On 2026-08-11 ADIRA stopped posting and nobody knew for fourteen days. Nothing had
// failed in a way anything could see: no error, no failed row, no alert. The scheduled
// workflows simply stopped running, and a system whose only signal is "a post appeared"
// cannot distinguish that from a quiet news week.
//
// So this reports EVERY DAY, healthy or not. The absence of a heartbeat is itself the
// alarm — if these messages stop arriving, the scheduler is dead, and you know within a
// day instead of a fortnight.
//
// Deliberately dependency-light: Supabase and Telegram only. No LLM, no image generation,
// no news APIs. It must be the last thing standing, so it touches as little as possible.

const STALE_HOURS = 30; // two missed slots at ~2/day

async function main(): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) { console.error('TELEGRAM_CHAT_ID not set — heartbeat cannot report'); process.exitCode = 1; return; }

  let line: string;
  let stale = false;

  try {
    const { data, error } = await serviceClient
      .from('content_backlog')
      .select('created_at, type, data')
      .eq('status', 'posted')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(`Supabase read failed: ${error.message}`);

    const last = data?.[0];
    if (!last) {
      stale = true;
      line = '⚠️ ADIRA has never posted — no posted rows at all.';
    } else {
      const ageH = (Date.now() - new Date(last.created_at).getTime()) / 3_600_000;
      const ist = new Date(new Date(last.created_at).getTime() + 5.5 * 3_600_000)
        .toISOString().replace('T', ' ').slice(0, 16);
      stale = ageH > STALE_HOURS;
      line = stale
        ? `🔴 ADIRA has not posted in ${Math.floor(ageH)} hours.\n\nLast post: ${ist} IST (${last.type}).\n\nThe scheduler is probably not running — check the Actions tab for disabled workflows.`
        : `🟢 ADIRA healthy. Last post ${Math.floor(ageH)}h ago — ${ist} IST (${last.type}).`;
    }
  } catch (err) {
    stale = true;
    line = `🔴 ADIRA heartbeat could not reach Supabase.\n\n${err instanceof Error ? err.message : String(err)}`;
  }

  const { bot } = await import('../telegram/bot');
  await bot.sendMessage(chatId, line);
  console.log(line);

  // Non-zero exit on staleness so the workflow run itself shows red in the Actions list.
  if (stale) process.exitCode = 1;
}

main();
