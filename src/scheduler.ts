import cron from 'node-cron';
import { runGrowthAgent, runCommentaryAgent } from './index';

// 8:00 AM IST = 2:30 AM UTC
// 10:00 AM IST = 4:30 AM UTC
export function startScheduler(): void {
  cron.schedule(
    '30 2 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] ⏰ Type 1 — Growth report running...`);
      await runGrowthAgent();
    },
    { timezone: 'Asia/Kolkata' }
  );

  cron.schedule(
    '30 4 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Commentary running...`);
      await runCommentaryAgent();
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('📅 Scheduler started — Type 1 at 8:00 AM IST, Type 2 at 10:00 AM IST');
}
