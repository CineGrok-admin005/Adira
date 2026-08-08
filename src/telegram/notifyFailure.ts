import dotenv from 'dotenv';
dotenv.config();

// Every pipeline used to swallow its errors into console.error inside a GitHub Actions run
// nobody reads. That is how a missing adira_memory table survived months and the Explainer
// posted zero rows without anyone noticing. Failures now land in the same Telegram chat that
// receives the drafts, so silence means "nothing ran", not "something broke quietly".
//
// Never throws: an alert that fails must not take down the run that was already failing.
export async function notifyFailure(source: string, error: unknown): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);

  try {
    const { bot } = await import('./bot');
    await bot.sendMessage(chatId, `🚨 ADIRA — ${source} failed\n\n${detail.slice(0, 1500)}`);
  } catch (err) {
    console.error('⚠️  Could not send failure alert:', err instanceof Error ? err.message : err);
  }
}
