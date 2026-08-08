import cron from 'node-cron';
import { runGrowthAgent, runCommentaryAgent, runExplainerAgent, preWarmType1, preWarmType2, preWarmType3 } from './index';

// Fallback scheduler for Railway persistent mode (not used when GitHub Actions is active)
// Pre-warm crons generate images 30 min before posting — instant posts on Railway
// timezone: 'Asia/Kolkata' means cron expressions are read in IST directly
export function startScheduler(): void {
  // Pre-warm Type 1 (30 min before ~8:07 AM)
  cron.schedule('37 7 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 1 image...`);
    await preWarmType1();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('7 8 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 1 — Growth report running...`);
    await runGrowthAgent();
  }, { timezone: 'Asia/Kolkata' });

  // Pre-warm Type 2 (30 min before ~12:07 PM)
  cron.schedule('37 11 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 2 image (midday)...`);
    await preWarmType2();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('7 12 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Midday Commentary running...`);
    await runCommentaryAgent();
  }, { timezone: 'Asia/Kolkata' });

  // Pre-warm Type 3 (30 min before ~4:07 PM)
  cron.schedule('37 15 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 3 image (afternoon)...`);
    await preWarmType3();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('7 16 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 3 — Afternoon Explainer running...`);
    await runExplainerAgent();
  }, { timezone: 'Asia/Kolkata' });

  // Pre-warm Type 2 (30 min before ~8:07 PM)
  cron.schedule('37 19 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔥 Pre-warming Type 2 image (evening)...`);
    await preWarmType2();
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('7 20 * * *', async () => {
    console.log(`[${new Date().toISOString()}] ⏰ Type 2 — Evening Commentary running...`);
    await runCommentaryAgent();
  }, { timezone: 'Asia/Kolkata' });

  console.log('📅 Scheduler: Growth ~8:07 | Commentary ~12:07 | Explainer ~16:07 | Commentary ~20:07 IST (pre-warm 30 min before each)');
}
