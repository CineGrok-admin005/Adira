import { serviceClient } from '../supabase/client';

export interface PostMemoryEntry {
  date: string;
  milestoneType: string;
  audience: string;
  toneUsed: string;
  openingLine: string;
}

export interface AdiraMemory {
  instagram: PostMemoryEntry[];
  linkedin: PostMemoryEntry[];
  twitter: PostMemoryEntry[];
  summaries: string[]; // compressed weekly summaries for long-term pattern awareness
}

const EMPTY_MEMORY: AdiraMemory = { instagram: [], linkedin: [], twitter: [], summaries: [] };
const FULL_DETAIL_DAYS = 6;
const PLATFORMS = ['instagram', 'linkedin', 'twitter'] as const;

function weekStart(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d.toISOString().split('T')[0];
}

function cutoffDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - FULL_DETAIL_DAYS);
  return d.toISOString().split('T')[0];
}

// Compress entries older than 6 days into weekly summaries, delete originals
async function compact(): Promise<void> {
  const cutoff = cutoffDate();

  for (const platform of PLATFORMS) {
    const { data: old } = await serviceClient
      .from('adira_memory')
      .select('*')
      .eq('platform', platform)
      .eq('is_summary', false)
      .lt('date', cutoff)
      .order('date');

    if (!old || old.length < 2) continue;

    // Group by ISO week
    const byWeek: Record<string, typeof old> = {};
    for (const row of old) {
      const w = weekStart(row.date);
      if (!byWeek[w]) byWeek[w] = [];
      byWeek[w].push(row);
    }

    for (const [week, rows] of Object.entries(byWeek)) {
      const tones     = [...new Set(rows.map(r => r.tone_used))].join(', ');
      const types     = [...new Set(rows.map(r => r.milestone_type))].join(', ');
      const audiences = [...new Set(rows.map(r => r.audience))].join(', ');
      const summaryText = `Week of ${week}: tones — ${tones}. types — ${types}. audience — ${audiences}.`;

      await serviceClient.from('adira_memory').insert({
        platform,
        date: week,
        milestone_type: 'WEEKLY_SUMMARY',
        audience: audiences,
        tone_used: tones,
        opening_line: '',
        is_summary: true,
        summary_text: summaryText,
      });

      await serviceClient
        .from('adira_memory')
        .delete()
        .in('id', rows.map(r => r.id));
    }
  }
}

export async function readMemory(): Promise<AdiraMemory> {
  try {
    const cutoff = cutoffDate();
    const result: AdiraMemory = { instagram: [], linkedin: [], twitter: [], summaries: [] };

    for (const platform of PLATFORMS) {
      // Recent full-detail rows (last 6 days)
      const { data: recent } = await serviceClient
        .from('adira_memory')
        .select('*')
        .eq('platform', platform)
        .eq('is_summary', false)
        .gte('date', cutoff)
        .order('date', { ascending: false })
        .limit(FULL_DETAIL_DAYS);

      result[platform] = (recent ?? []).map(r => ({
        date: r.date,
        milestoneType: r.milestone_type,
        audience: r.audience,
        toneUsed: r.tone_used,
        openingLine: r.opening_line,
      }));
    }

    // Weekly summaries (last 4 weeks, any platform — gives long-term pattern)
    const { data: summaries } = await serviceClient
      .from('adira_memory')
      .select('summary_text')
      .eq('is_summary', true)
      .order('date', { ascending: false })
      .limit(4);

    result.summaries = (summaries ?? []).map(r => r.summary_text).filter(Boolean);

    return result;
  } catch (err) {
    console.warn('⚠️  Memory read failed, starting fresh:', (err as Error).message);
    return EMPTY_MEMORY;
  }
}

export async function writeMemory(
  platform: keyof Omit<AdiraMemory, 'summaries'>,
  entry: PostMemoryEntry
): Promise<void> {
  try {
    await serviceClient.from('adira_memory').insert({
      platform,
      date: entry.date,
      milestone_type: entry.milestoneType,
      audience: entry.audience,
      tone_used: entry.toneUsed,
      opening_line: entry.openingLine,
      is_summary: false,
    });

    // Compact old entries after every write
    await compact();
  } catch (err) {
    console.warn('⚠️  Memory write failed:', (err as Error).message);
  }
}

export function formatMemoryContext(memory: AdiraMemory): string {
  const formatRecent = (entries: PostMemoryEntry[], label: string) => {
    if (entries.length === 0) return `${label}: no recent history`;
    return `${label} (last ${entries.length} days):\n` +
      entries.map(e => `  ${e.date} | tone: ${e.toneUsed} | opened with: "${e.openingLine}"`).join('\n');
  };

  const recentSection = [
    formatRecent(memory.instagram, 'Instagram'),
    formatRecent(memory.linkedin,  'LinkedIn'),
    formatRecent(memory.twitter,   'Twitter'),
  ].join('\n');

  const summarySection = memory.summaries.length > 0
    ? `\nLonger pattern (do not repeat these tone clusters):\n` +
      memory.summaries.map(s => `  ${s}`).join('\n')
    : '';

  return recentSection + summarySection;
}
