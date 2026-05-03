import cron from 'node-cron';
import { runGrowthAgent, runCommentaryAgent, preWarmType1, preWarmType2 } from './index';

// Fallback scheduler for Railway persistent mode (not used when GitHub Actions is active)
// Pre-warm crons generate images 30 min before posting — instant posts on Railway
// timezone: 'Asia/Kolkata' means cron expressions are read in IST directly
export function startScheduler(): void {
  // Pre-warm Type 1 (30 min before 8 AM)
  cron.schedule('30 7 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 1 image...`);
    await preWarmType1();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 8 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 1 — Growth report running...`);
    await runGrowthAgent();
  }, { timezone: 'Asia/Kolkata' });

  // Pre-warm Type 2 (30 min before 1 PM)
  cron.schedule('30 12 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 2 image (mid-day)...`);
    await preWarmType2();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 13 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Mid-day Commentary running...`);
    await runCommentaryAgent();
  }, { timezone: 'Asia/Kolkata' });

  // Pre-warm Type 2 (30 min before 7 PM)
  cron.schedule('30 18 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 2 image (evening)...`);
    await preWarmType2();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 19 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Evening Commentary running...`);
    await runCommentaryAgent();
  }, { timezone: 'Asia/Kolkata' });

  console.log('📅 Scheduler: pre-warm 7:30/12:30/18:30 | posts 8:00/13:00/19:00 IST');
}
