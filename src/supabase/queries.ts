import { anonClient, serviceClient } from './client';
import { GrowthData, PublicJoiner } from '../types';

export interface DemoFilterDiagnostic {
  totalFilmmakers: number;
  demoFilmmakers: number;
  realFilmmakers: number;
  publishedReal: number;
}

export async function fetchDemoFilterDiagnostic(): Promise<DemoFilterDiagnostic> {
  const { count: totalFilmmakers } = await serviceClient
    .from('filmmakers')
    .select('*', { count: 'exact', head: true });

  const { count: demoFilmmakers } = await serviceClient
    .from('filmmakers')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'demo');

  const real = (totalFilmmakers ?? 0) - (demoFilmmakers ?? 0);

  const { count: publishedReal } = await anonClient
    .from('filmmakers')
    .select('*', { count: 'exact', head: true })
    .eq('is_published', true)
    .in('subscription_status', REAL_STATUSES);

  return {
    totalFilmmakers: totalFilmmakers ?? 0,
    demoFilmmakers: demoFilmmakers ?? 0,
    realFilmmakers: real,
    publishedReal: publishedReal ?? 0,
  };
}

// Status values that indicate a real, active filmmaker (not a demo placeholder)
const REAL_STATUSES = ['active', 'beta', 'free', 'premiere'];

// A publicly visible, non-demo filmmaker
const PUBLISHED_FILTER = {
  is_published: true,
  // subscription_status filtered via .in() below
};

function extractFirstName(fullName: string | null): string {
  if (!fullName) return 'A filmmaker';
  return fullName.split(' ')[0];
}

function extractPrimaryRole(roles: string[] | null): string {
  if (!roles || roles.length === 0) return 'Filmmaker';
  return roles[0];
}

export async function fetchGrowthData(): Promise<GrowthData> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // --- Step 1: Get IDs of demo filmmaker profiles so we can exclude them ---
  const { data: demoFilmmakers } = await serviceClient
    .from('filmmakers')
    .select('id')
    .eq('subscription_status', 'demo');

  const demoFilmmakerIds = (demoFilmmakers || []).map(f => f.id as string);

  // --- Step 2: Count real signups from profiles table (service role bypasses RLS) ---
  // "Real" = profile not linked to a demo filmmaker
  let totalQuery = serviceClient
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (demoFilmmakerIds.length > 0) {
    totalQuery = totalQuery.not('filmmaker_id', 'in', `(${demoFilmmakerIds.join(',')})`);
  }

  const { count: totalRealUsers } = await totalQuery;

  // New today (real users)
  let todayQuery = serviceClient
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneDayAgo);

  if (demoFilmmakerIds.length > 0) {
    todayQuery = todayQuery.not('filmmaker_id', 'in', `(${demoFilmmakerIds.join(',')})`);
  }

  const { count: newToday } = await todayQuery;

  // New this week (real users)
  let weekQuery = serviceClient
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneWeekAgo);

  if (demoFilmmakerIds.length > 0) {
    weekQuery = weekQuery.not('filmmaker_id', 'in', `(${demoFilmmakerIds.join(',')})`);
  }

  const { count: newThisWeek } = await weekQuery;

  // --- Step 3: Recent real public joiners from filmmakers table ---
  const { data: recentRaw } = await anonClient
    .from('filmmakers')
    .select('name, primary_roles, current_city, current_state')
    .eq('is_published', true)
    .in('subscription_status', REAL_STATUSES)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentPublicJoiners: PublicJoiner[] = (recentRaw || []).map(f => ({
    firstName: extractFirstName(f.name),
    primaryRole: extractPrimaryRole(f.primary_roles),
    city: f.current_city || '',
    state: f.current_state || '',
  }));

  // --- Step 4: First female filmmaker (pronouns contains 'she') ---
  const { data: femaleData } = await anonClient
    .from('filmmakers')
    .select('name, primary_roles, current_city, current_state, created_at')
    .eq('is_published', true)
    .in('subscription_status', REAL_STATUSES)
    .ilike('pronouns', '%she%')
    .order('created_at', { ascending: true })
    .limit(1);

  const firstFemaleFilmmaker: PublicJoiner | null =
    femaleData && femaleData.length > 0
      ? {
          firstName: extractFirstName(femaleData[0].name),
          primaryRole: extractPrimaryRole(femaleData[0].primary_roles),
          city: femaleData[0].current_city || '',
          state: femaleData[0].current_state || '',
        }
      : null;

  // --- Step 5: First filmmaker from a new city (joined in last 24h, city new to platform) ---
  const { data: newCityData } = await anonClient
    .from('filmmakers')
    .select('name, primary_roles, current_city, current_state')
    .eq('is_published', true)
    .in('subscription_status', REAL_STATUSES)
    .gte('created_at', oneDayAgo)
    .not('current_city', 'is', null)
    .limit(10);

  let firstFromNewCity: PublicJoiner | null = null;
  if (newCityData && newCityData.length > 0) {
    for (const joiner of newCityData) {
      const { count: cityCount } = await anonClient
        .from('filmmakers')
        .select('*', { count: 'exact', head: true })
        .eq('is_published', true)
        .in('subscription_status', REAL_STATUSES)
        .eq('current_city', joiner.current_city);

      if (cityCount === 1) {
        firstFromNewCity = {
          firstName: extractFirstName(joiner.name),
          primaryRole: extractPrimaryRole(joiner.primary_roles),
          city: joiner.current_city || '',
          state: joiner.current_state || '',
        };
        break;
      }
    }
  }

  // --- Step 6: Milestone check against total real user count ---
  const MILESTONE_NUMBERS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]; // 5 is temporary for testing, remove after
  const total = totalRealUsers || 0;
  const joinedToday = newToday || 0;
  // Normally: only fire if the milestone was crossed today (total crossed threshold since yesterday)
  // TEST OVERRIDE: if --test-milestone flag set, fire for the nearest milestone at or below total
  const isTestMilestone = process.argv.includes('--test-milestone');
  const milestoneHit = isTestMilestone
    ? (MILESTONE_NUMBERS.filter(m => total >= m).pop() ?? null)
    : (MILESTONE_NUMBERS.find(m => total >= m && total - joinedToday < m) ?? null);

  return {
    totalRealUsers: total,
    newToday: joinedToday,
    newThisWeek: newThisWeek || 0,
    recentPublicJoiners,
    firstFemaleFilmmaker,
    firstFromNewCity,
    milestoneHit,
  };
}
