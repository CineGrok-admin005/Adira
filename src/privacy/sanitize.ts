import { GrowthData } from '../types';

// Whitelist approach — only explicitly safe fields pass through to Claude or social media
export function sanitizeForPublic(data: GrowthData): GrowthData {
  const safe: GrowthData = {
    totalRealUsers: data.totalRealUsers,
    newToday: data.newToday,
    newThisWeek: data.newThisWeek,
    milestoneHit: data.milestoneHit,

    recentPublicJoiners: data.recentPublicJoiners.map(f => ({
      firstName: f.firstName,      // first name only — never full name
      primaryRole: f.primaryRole,  // public role
      city: f.city,                // public city
      state: f.state,              // public state
      // NEVER: email, phone, userId, slug, pronouns, date_of_birth, legal_name
    })),

    firstFemaleFilmmaker: data.firstFemaleFilmmaker
      ? {
          firstName: data.firstFemaleFilmmaker.firstName,
          primaryRole: data.firstFemaleFilmmaker.primaryRole,
          city: data.firstFemaleFilmmaker.city,
          state: data.firstFemaleFilmmaker.state,
        }
      : null,

    firstFromNewCity: data.firstFromNewCity
      ? {
          firstName: data.firstFromNewCity.firstName,
          primaryRole: data.firstFromNewCity.primaryRole,
          city: data.firstFromNewCity.city,
          state: data.firstFromNewCity.state,
        }
      : null,

    // Engagement stats — aggregated, no individual PII
    totalProfileViews: data.totalProfileViews,
    totalProfileClicks: data.totalProfileClicks,
    weeklyProfileViews: data.weeklyProfileViews,
    openToCollaborations: data.openToCollaborations,
    uniqueCities: data.uniqueCities,
    uniqueStates: data.uniqueStates,
    foundingMemberCount: data.foundingMemberCount,
    roleBreakdown: data.roleBreakdown,
    topGenres: data.topGenres,
    multiRoleCount: data.multiRoleCount,
  };

  // Final safety scan — reject anything that looks like PII slipping through
  const safeString = JSON.stringify(safe);
  const forbidden = ['@gmail', '@yahoo', '@hotmail', '.com', 'password', 'token', 'secret'];
  for (const pattern of forbidden) {
    if (safeString.toLowerCase().includes(pattern)) {
      throw new Error(
        `PRIVACY GUARD: Detected forbidden pattern "${pattern}" in sanitized data. Aborting before Claude call.`
      );
    }
  }

  return safe;
}
