import cron from 'node-cron';
import { runGrowthAgent, runCommentaryAgent } from './index';

// timezone: 'Asia/Kolkata' means cron expressions are read in IST directly
export function startScheduler(): void {
  // 8:00 AM IST - Platform Growth Report
  cron.schedule(
    '0 8 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] ⏰ Type 1 — Growth report running...`);
      await runGrowthAgent();
    },
    { timezone: 'Asia/Kolkata' }
  );

  // 1:00 PM IST - Mid-day Commentary
  cron.schedule(
    '0 13 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Mid-day Commentary running...`);
      await runCommentaryAgent();
    },
    { timezone: 'Asia/Kolkata' }
  );

  // 7:00 PM IST - Evening Commentary
  cron.schedule(
    '0 19 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Evening Commentary running...`);
      await runCommentaryAgent();
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('📅 Scheduler started — Type 1 at 8:00 AM, Type 2 at 1:00 PM and 7:00 PM IST');
}
