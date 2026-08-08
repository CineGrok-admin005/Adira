import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { BacklogItem } from '../types';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function pushToBacklog(type: 'MILESTONE' | 'COMMENTARY' | 'EXPLAINER', priority: number, data: any, ttlDays: number): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const { error } = await supabase
    .from('content_backlog')
    .insert({
      type,
      priority,
      data,
      status: 'queued',
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    console.error('❌ Failed to push to backlog:', error.message);
  } else {
    console.log(`📦 Pushed to backlog: ${type} (Priority: ${priority})`);
  }
}

export async function getNextFromBacklog(type: 'MILESTONE' | 'COMMENTARY' | 'EXPLAINER'): Promise<BacklogItem | null> {
  // First, mark expired items as superseded or expired (if we want, or just filter them out)
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('content_backlog')
    .select('*')
    .eq('type', type)
    .eq('status', 'queued')
    .gt('expires_at', now)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('❌ Failed to fetch from backlog:', error.message);
    return null;
  }

  return data as BacklogItem | null;
}

export async function markBacklogItemPosted(id: string): Promise<void> {
  const { error } = await supabase
    .from('content_backlog')
    .update({ status: 'posted' })
    .eq('id', id);

  if (error) {
    console.error('❌ Failed to mark backlog item as posted:', error.message);
  }
}

// Guards against double-posting when both an external trigger and GitHub's native (often
// delayed) `schedule:` backup fire for the same slot. Uses a rolling window rather than a
// calendar-day check because Commentary has two legitimate slots/day (~8h apart) — a 6h window
// safely catches a same-slot duplicate (worst observed schedule-trigger delay so far: ~6.1h)
// without blocking the next real slot. Fails OPEN (returns false) on a query error — a rare
// duplicate post is a smaller problem than silently skipping a real one.
export async function hasPostedRecently(type: 'MILESTONE' | 'COMMENTARY' | 'EXPLAINER', hours = 6): Promise<boolean> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('content_backlog')
    .select('*', { count: 'exact', head: true })
    .eq('type', type)
    .eq('status', 'posted')
    .gte('created_at', since);

  if (error) {
    console.error('❌ Failed to check hasPostedRecently:', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

// The queue only ever grew. Each Commentary run pushes up to 5 candidates and consumes one,
// and getNextFromBacklog filters on `expires_at` — so expired rows became permanently
// unreachable but were never deleted. By 2026-08-07 that was 613 dead rows out of 862.
// Sweep them on every run. Only touches 'queued' rows: 'posted' rows are the dedup ledger
// (and now the post archive) and must survive their own expiry.
export async function purgeExpiredBacklog(): Promise<void> {
  const { error, count } = await supabase
    .from('content_backlog')
    .delete({ count: 'exact' })
    .eq('status', 'queued')
    .lt('expires_at', new Date().toISOString());

  if (error) console.error('❌ Failed to purge expired backlog rows:', error.message);
  else if ((count ?? 0) > 0) console.log(`🧹 Purged ${count} expired backlog item(s).`);
}

export async function supersedeMilestones(): Promise<void> {
  // Simple logic: If we insert a new milestone, we might supersede older ones.
  // For now, let's just mark everything older as superseded if we post a new organic one.
  const { error } = await supabase
    .from('content_backlog')
    .update({ status: 'superseded' })
    .eq('type', 'MILESTONE')
    .eq('status', 'queued');

  if (error) {
    console.error('❌ Failed to supersede backlog milestones:', error.message);
  }
}
