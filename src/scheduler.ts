import cron from 'node-cron';
import { runGrowthAgent, runCommentaryAgent } from './index';

// Fallback scheduler for Railway persistent mode (not used when GitHub Actions is active)
// timezone: 'Asia/Kolkata' means cron expressions are read in IST directly
export function startScheduler(): void {
  cron.schedule('0 8 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 1 — Growth report running...`);
    await runGrowthAgent();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 13 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Mid-day Commentary running...`);
    await runCommentaryAgent();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 19 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Evening Commentary running...`);
    await runCommentaryAgent();
  }, { timezone: 'Asia/Kolkata' });

  console.log('📅 Scheduler: 8:00 AM | 1:00 PM | 7:00 PM IST');
}
