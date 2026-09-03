import { EXPLAINER_TOPICS } from './topics';
import type { ExplainerPillar } from '../types';

// Lives here rather than in src/index.ts so that anything needing it — the scheduled run and
// src/scripts/preview-explainer.ts alike — can import it WITHOUT importing the entry point.
// index.ts runs a CLI dispatcher at module load whose final branch is startScheduler(), so
// `import { pickExplainerSeed } from '../index'` silently registers every cron job and never
// returns. The preview script did exactly that on 2026-09-03 and hung indefinitely; left
// running long enough it would have begun publishing on the real schedule.
// Picks the next Explainer topic: excludes the immediately-previous pillar and anything posted
// in the last ~90 days; drops the pillar constraint, then falls back to least-recently-used
// (never-used first), if the bank is exhausted under those constraints. Deterministic per IST
// calendar day (not random per call) so a pre-warm run and the real run later that day always
// pick the same topic — otherwise a cached pre-warmed image could mismatch the real post's topic.
// Exported so src/scripts/preview-explainer.ts can select the same topic the scheduled run
// would. Duplicating this logic in the preview is exactly how preview-post.ts drifted onto a
// different story pool than production and spent weeks previewing a pipeline nobody ran.
export async function pickExplainerSeed(): Promise<{ pillar: ExplainerPillar; topic: string }> {
  const { serviceClient } = await import('../supabase/client');
  const { data: rows } = await serviceClient
    .from('content_backlog')
    .select('data, created_at')
    .eq('type', 'EXPLAINER')
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(200);

  const posted = (rows || []) as { data: { pillar?: string; topic?: string }; created_at: string }[];
  const lastPillar = posted[0]?.data?.pillar;
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const usedWithin90d = new Set(
    posted.filter(r => new Date(r.created_at).getTime() >= ninetyDaysAgo).map(r => r.data?.topic).filter(Boolean)
  );

  let candidates = EXPLAINER_TOPICS.filter(t => !usedWithin90d.has(t.topic) && t.pillar !== lastPillar);
  if (candidates.length === 0) candidates = EXPLAINER_TOPICS.filter(t => !usedWithin90d.has(t.topic));

  if (candidates.length === 0) {
    // Bank exhausted within 90 days for every topic — fall back to least-recently-used (never-used first)
    const lastUsedAt = new Map<string, number>();
    for (const r of posted) {
      const topic = r.data?.topic;
      if (topic && !lastUsedAt.has(topic)) lastUsedAt.set(topic, new Date(r.created_at).getTime());
    }
    candidates = [...EXPLAINER_TOPICS].sort((a, b) => (lastUsedAt.get(a.topic) ?? 0) - (lastUsedAt.get(b.topic) ?? 0));
    return candidates[0];
  }

  const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
  let hash = 0;
  for (const ch of todayIST) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return candidates[hash % candidates.length];
}
