import { GrowthData } from '../types';

// Whitelist approach — only explicitly safe fields pass through to Claude or social media
export function sanitizeForPublic(data: GrowthData): GrowthData {
  const safe: GrowthData = {
    totalRealUsers: data.totalRealUsers,
    newToday: data.newToday,
    newThisWeek: data.newThisWeek,
    milestoneHit: data.milestoneHit,

    recentPublicJoiners: data.recentPublicJoiners.map(f => ({
      firstName: f.firstName,
      primaryRole: f.primaryRole,
      city: f.city,
      state: f.state,
      cineGrokUrl: f.cineGrokUrl,         // public profile link
      instagramHandle: f.instagramHandle, // @handle — public, filmmaker provided
      linkedinUrl: f.linkedinUrl,         // public LinkedIn URL
      twitterHandle: f.twitterHandle,     // @handle — public
      // NEVER: email, phone, userId, pronouns, date_of_birth, legal_name
    })),

    firstFemaleFilmmaker: data.firstFemaleFilmmaker
      ? {
          firstName: data.firstFemaleFilmmaker.firstName,
          primaryRole: data.firstFemaleFilmmaker.primaryRole,
          city: data.firstFemaleFilmmaker.city,
          state: data.firstFemaleFilmmaker.state,
          cineGrokUrl: data.firstFemaleFilmmaker.cineGrokUrl,
          instagramHandle: data.firstFemaleFilmmaker.instagramHandle,
          linkedinUrl: data.firstFemaleFilmmaker.linkedinUrl,
          twitterHandle: data.firstFemaleFilmmaker.twitterHandle,
        }
      : null,

    firstFromNewCity: data.firstFromNewCity
      ? {
          firstName: data.firstFromNewCity.firstName,
          primaryRole: data.firstFromNewCity.primaryRole,
          city: data.firstFromNewCity.city,
          state: data.firstFromNewCity.state,
          cineGrokUrl: data.firstFromNewCity.cineGrokUrl,
          instagramHandle: data.firstFromNewCity.instagramHandle,
          linkedinUrl: data.firstFromNewCity.linkedinUrl,
          twitterHandle: data.firstFromNewCity.twitterHandle,
        }
      : null,

    // Engagement — all aggregated, no individual PII
    totalProfileViews: data.totalProfileViews,
    weeklyProfileViews: data.weeklyProfileViews,
    totalProfileClicks: data.totalProfileClicks,
    weeklyInstagramReferrals: data.weeklyInstagramReferrals,
    openToCollaborations: data.openToCollaborations,
    shortlistedCount: data.shortlistedCount,
    uniqueCities: data.uniqueCities,
    uniqueStates: data.uniqueStates,
    foundingMemberCount: data.foundingMemberCount,
    totalFilmsInPortfolios: data.totalFilmsInPortfolios,
    activeOpportunities: data.activeOpportunities,
    roleBreakdown: data.roleBreakdown,
    topGenres: data.topGenres,
    multiRoleCount: data.multiRoleCount,
  };

  // Final safety scan — reject emails, passwords, secrets
  // Note: .com alone is NOT forbidden — social/profile URLs (instagram.com, linkedin.com) are intentional
  const safeString = JSON.stringify(safe);
  const forbidden = ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com', 'password', 'secret'];
  for (const pattern of forbidden) {
    if (safeString.toLowerCase().includes(pattern)) {
      throw new Error(
        `PRIVACY GUARD: Detected forbidden pattern "${pattern}" in sanitized data. Aborting before Claude call.`
      );
    }
  }
  // Also reject bare email patterns (anything@anything.tld not already caught)
  if (/"[^"]*@[^"]*\.[a-z]{2,}"/.test(safeString) && !safeString.includes('cinegrok.in')) {
    throw new Error('PRIVACY GUARD: Detected email address pattern in sanitized data. Aborting.');
  }

  return safe;
}
