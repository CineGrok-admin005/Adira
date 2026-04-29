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


function extractFirstName(fullName: string | null): string {
  if (!fullName) return 'A filmmaker';
  return fullName.split(' ')[0];
}

function extractPrimaryRole(roles: string[] | null): string {
  if (!roles || roles.length === 0) return 'Filmmaker';
  return roles[0];
}

// Validate URL actually belongs to the expected platform
function validatePlatformUrl(url: string | null, platform: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const domains: Record<string, string[]> = {
    instagram: ['instagram.com'],
    twitter:   ['twitter.com', 'x.com'],
    linkedin:  ['linkedin.com'],
    youtube:   ['youtube.com', 'youtu.be'],
  };
  const allowed = domains[platform] || [];
  return allowed.some(d => url.toLowerCase().includes(d));
}

function extractHandle(url: string | null, platform: 'instagram' | 'twitter'): string | null {
  if (!url || !validatePlatformUrl(url, platform)) return null;
  const patterns: Record<string, RegExp> = {
    instagram: /instagram\.com\/([^/?#\s]+)/,
    twitter:   /(?:twitter|x)\.com\/([^/?#\s]+)/,
  };
  const match = url.match(patterns[platform]);
  if (!match || !match[1]) return null;
  // Strip trailing slash artifacts, filter out non-handle paths
  const handle = match[1].replace(/\/$/, '');
  if (['intent', 'share', 'p', 'reel', 'stories', 'explore'].includes(handle)) return null;
  return `@${handle}`;
}

function extractLinkedInUrl(url: string | null): string | null {
  if (!url || !validatePlatformUrl(url, 'linkedin')) return null;
  return url.split('?')[0].replace(/\/$/, ''); // strip query params and trailing slash
}

// Read social from both raw_form_data.socials.{key} (demo) and raw_form_data.{key} (real)
function getSocial(rd: Record<string, unknown>, key: string): string | null {
  const fromSocials = (rd.socials as Record<string, string> | undefined)?.[key] || null;
  const direct = (rd[key] as string | undefined) || null;
  return fromSocials || direct || null;
}

function buildCineGrokUrl(slug: string | null): string {
  if (!slug) return 'https://cinegrok.in';
  return `https://cinegrok.in/filmmakers/${slug}`;
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

  // --- Step 3: Recent real public joiners — include slug and socials for tagging ---
  const { data: recentRaw } = await anonClient
    .from('filmmakers')
    .select('name, slug, primary_roles, current_city, current_state, raw_form_data')
    .eq('is_published', true)
    .in('subscription_status', REAL_STATUSES)
    .order('created_at', { ascending: false })
    .limit(5) as { data: Array<{
      name: string;
      slug: string | null;
      primary_roles: string[] | null;
      current_city: string | null;
      current_state: string | null;
      raw_form_data: Record<string, unknown> | null;
    }> | null };

  const recentPublicJoiners: PublicJoiner[] = (recentRaw || []).map(f => {
    const rd = f.raw_form_data || {};
    const city  = (f.current_city  || rd.currentCity  || rd.current_city  || '') as string;
    const state = (f.current_state || rd.currentState || rd.current_state || '') as string;
    const roles = (rd.primaryRoles || rd.primary_roles || f.primary_roles || []) as string[];
    return {
      firstName: extractFirstName(f.name),
      primaryRole: extractPrimaryRole(roles),
      city,
      state,
      cineGrokUrl: buildCineGrokUrl(f.slug),
      instagramHandle: extractHandle(getSocial(rd, 'instagram'), 'instagram'),
      linkedinUrl:     extractLinkedInUrl(getSocial(rd, 'linkedin')),
      twitterHandle:   extractHandle(getSocial(rd, 'twitter'), 'twitter'),
    };
  });

  // --- Step 4: First female filmmaker (pronouns contains 'she') ---
  const { data: femaleData } = await anonClient
    .from('filmmakers')
    .select('name, slug, primary_roles, current_city, current_state, raw_form_data, created_at')
    .eq('is_published', true)
    .in('subscription_status', REAL_STATUSES)
    .ilike('pronouns', '%she%')
    .order('created_at', { ascending: true })
    .limit(1) as { data: Array<{
      name: string; slug: string | null; primary_roles: string[] | null;
      current_city: string | null; current_state: string | null;
      raw_form_data: Record<string, unknown> | null; created_at: string;
    }> | null };

  const firstFemaleFilmmaker: PublicJoiner | null =
    femaleData && femaleData.length > 0
      ? (() => {
          const f = femaleData[0];
          const rd = f.raw_form_data || {};
          return {
            firstName: extractFirstName(f.name),
            primaryRole: extractPrimaryRole(f.primary_roles),
            city: f.current_city || '',
            state: f.current_state || '',
            cineGrokUrl: buildCineGrokUrl(f.slug),
            instagramHandle: extractHandle(getSocial(rd, 'instagram'), 'instagram'),
            linkedinUrl:     extractLinkedInUrl(getSocial(rd, 'linkedin')),
            twitterHandle:   extractHandle(getSocial(rd, 'twitter'), 'twitter'),
          };
        })()
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
          cineGrokUrl: buildCineGrokUrl(null),
          instagramHandle: null,
          linkedinUrl: null,
          twitterHandle: null,
        };
        break;
      }
    }
  }

  // --- Step 6: Milestone check ---
  const MILESTONE_NUMBERS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  const total = totalRealUsers || 0;
  const joinedToday = newToday || 0;
  const isTestMilestone = process.argv.includes('--test-milestone');
  const milestoneHit = isTestMilestone
    ? (MILESTONE_NUMBERS.filter(m => total >= m).pop() ?? null)
    : (MILESTONE_NUMBERS.find(m => total >= m && total - joinedToday < m) ?? null);

  // --- Step 7: Profile analytics — views and clicks from dedicated analytics tables ---
  const { data: allDailyAnalytics } = await serviceClient
    .from('profile_analytics_daily')
    .select('views, clicks, referrer_instagram, date') as {
      data: Array<{ views: number; clicks: number; referrer_instagram: number; date: string }> | null
    };

  const analytics = allDailyAnalytics || [];
  const totalProfileViews  = analytics.reduce((s, r) => s + (r.views  || 0), 0);
  const totalProfileClicks = analytics.reduce((s, r) => s + (r.clicks || 0), 0);
  const weeklyProfileViews = analytics
    .filter(r => r.date >= oneWeekAgo.split('T')[0])
    .reduce((s, r) => s + (r.views || 0), 0);
  const weeklyInstagramReferrals = analytics
    .filter(r => r.date >= oneWeekAgo.split('T')[0])
    .reduce((s, r) => s + (r.referrer_instagram || 0), 0);

  // --- Step 8: Shortlisted count — collaboration signal ---
  const { count: shortlistedCount } = await serviceClient
    .from('interested_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'shortlisted');

  // --- Step 9: Active opportunities (festivals, grants) ---
  const { count: activeOpportunities } = await serviceClient
    .from('opportunities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved');

  // --- Step 10: Founding members ---
  const { count: foundingMemberCount } = await serviceClient
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('founding_member_number', 'is', null);

  // --- Step 11: Rich profile data from raw_form_data (the real source of truth) ---
  const { data: rawProfiles } = await anonClient
    .from('filmmakers')
    .select('raw_form_data')
    .eq('is_published', true)
    .in('subscription_status', REAL_STATUSES)
    .not('raw_form_data', 'is', null) as {
      data: Array<{ raw_form_data: Record<string, unknown> }> | null
    };

  const profiles = (rawProfiles || []).map(r => r.raw_form_data);

  // Cities and states from raw_form_data (camelCase keys)
  const cities  = profiles.map(p => (p.currentCity  || p.current_city)  as string).filter(Boolean);
  const states  = profiles.map(p => (p.currentState || p.current_state) as string).filter(Boolean);
  const uniqueCities = new Set(cities).size;
  const uniqueStates = new Set(states).size;

  // Open to collaborations
  const openToCollaborations = profiles.filter(p => {
    const v = p.openToCollaborations || p.open_to_collaborations;
    return v === true || (typeof v === 'string' && v.toLowerCase().includes('yes'));
  }).length;

  // Role breakdown from primaryRoles in raw_form_data
  const roleBreakdown: Record<string, number> = {};
  for (const p of profiles) {
    const roles = (p.primaryRoles || p.primary_roles || []) as string[];
    for (const role of roles) {
      if (role) roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
    }
  }

  // Multi-role filmmakers
  const multiRoleCount = profiles.filter(p => {
    const sec = (p.secondaryRoles || p.secondary_roles || []) as string[];
    return sec.length > 0;
  }).length;

  // Genres from films/filmography in raw_form_data
  const genreCounts: Record<string, number> = {};
  let totalFilmsInPortfolios = 0;
  for (const p of profiles) {
    const films = ((p.films || p.filmography || []) as Array<{ genre?: string }>);
    totalFilmsInPortfolios += films.length;
    for (const film of films) {
      if (film.genre) {
        // genres can be comma-separated e.g. "Thriller, Crime" — split and count each
        for (const g of film.genre.split(',').map((s: string) => s.trim()).filter(Boolean)) {
          genreCounts[g] = (genreCounts[g] || 0) + 1;
        }
      }
    }
  }
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre);

  return {
    totalRealUsers: total,
    newToday: joinedToday,
    newThisWeek: newThisWeek || 0,
    recentPublicJoiners,
    firstFemaleFilmmaker,
    firstFromNewCity,
    milestoneHit,
    totalProfileViews,
    weeklyProfileViews,
    totalProfileClicks,
    weeklyInstagramReferrals,
    openToCollaborations,
    shortlistedCount: shortlistedCount || 0,
    uniqueCities,
    uniqueStates,
    foundingMemberCount: foundingMemberCount || 0,
    totalFilmsInPortfolios,
    activeOpportunities: activeOpportunities || 0,
    roleBreakdown,
    topGenres,
    multiRoleCount,
  };
}
