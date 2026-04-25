import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { BacklogItem } from '../types';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function pushToBacklog(type: 'MILESTONE' | 'COMMENTARY', priority: number, data: any, ttlDays: number): Promise<void> {
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

export async function getNextFromBacklog(type: 'MILESTONE' | 'COMMENTARY'): Promise<BacklogItem | null> {
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
