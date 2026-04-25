import cron from 'node-cron';
import { runGrowthAgent, runCommentaryAgent } from './index';

// timezone: 'Asia/Kolkata' means cron expressions are read in IST directly
// So '0 8 * * *' = 8:00 AM IST, '0 10 * * *' = 10:00 AM IST
export function startScheduler(): void {
  cron.schedule(
    '0 8 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] ⏰ Type 1 — Growth report running...`);
      await runGrowthAgent();
    },
    { timezone: 'Asia/Kolkata' }
  );

  cron.schedule(
    '0 10 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Commentary running...`);
      await runCommentaryAgent();
    },
    { timezone: 'Asia/Kolkata' }
  );

  console.log('📅 Scheduler started — Type 1 at 8:00 AM IST, Type 2 at 10:00 AM IST');
}
