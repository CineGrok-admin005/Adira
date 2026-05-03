import cron from 'node-cron';
import { runGrowthAgent, runCommentaryAgent, preWarmType1, preWarmType2 } from './index';

// timezone: 'Asia/Kolkata' means cron expressions are read in IST directly
export function startScheduler(): void {

  // 7:30 AM — pre-warm Type 1 image (30 min before posting)
  cron.schedule('30 7 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 1 image...`);
    await preWarmType1();
  }, { timezone: 'Asia/Kolkata' });

  // 8:00 AM — Post Type 1 (uses pre-warmed image if available)
  cron.schedule('0 8 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 1 — Growth report running...`);
    await runGrowthAgent();
  }, { timezone: 'Asia/Kolkata' });

  // 12:30 PM — pre-warm Type 2 image (30 min before 1 PM)
  cron.schedule('30 12 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 2 image (mid-day)...`);
    await preWarmType2();
  }, { timezone: 'Asia/Kolkata' });

  // 1:00 PM — Post Type 2 commentary
  cron.schedule('0 13 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Mid-day Commentary running...`);
    await runCommentaryAgent();
  }, { timezone: 'Asia/Kolkata' });

  // 6:30 PM — pre-warm Type 2 image (30 min before 7 PM)
  cron.schedule('30 18 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 2 image (evening)...`);
    await preWarmType2();
  }, { timezone: 'Asia/Kolkata' });

  // 7:00 PM — Post Type 2 commentary
  cron.schedule('0 19 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Evening Commentary running...`);
    await runCommentaryAgent();
  }, { timezone: 'Asia/Kolkata' });

  console.log('📅 Scheduler: pre-warm at 7:30/12:30/18:30 IST | posts at 8:00/13:00/19:00 IST');
}
