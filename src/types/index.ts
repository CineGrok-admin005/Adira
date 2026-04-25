export type AudienceMode = 'general' | 'filmmaker' | 'industry';

export interface GrowthData {
  // Signup counts
  totalRealUsers: number;
  newToday: number;
  newThisWeek: number;

  // Recent joiners
  recentPublicJoiners: PublicJoiner[];
  firstFemaleFilmmaker: PublicJoiner | null;
  firstFromNewCity: PublicJoiner | null;
  milestoneHit: number | null;

  // Profile engagement (from profile_analytics_daily)
  totalProfileViews: number;
  weeklyProfileViews: number;
  totalProfileClicks: number;
  weeklyInstagramReferrals: number; // people finding CineGrok filmmakers via Instagram

  // Collaboration signals
  openToCollaborations: number;  // filmmakers with openToCollaborations = "Yes"
  shortlistedCount: number;      // times a filmmaker was shortlisted by someone

  // Platform reach
  uniqueCities: number;
  uniqueStates: number;
  foundingMemberCount: number;

  // Content depth
  totalFilmsInPortfolios: number;  // total films uploaded across all filmmakers
  activeOpportunities: number;     // live festivals/grants on CineGrok

  // Community composition (from raw_form_data)
  roleBreakdown: Record<string, number>;
  topGenres: string[];
  multiRoleCount: number;
}

export interface PublicJoiner {
  firstName: string;
  primaryRole: string;
  city: string;
  state: string;
}

export interface GeneratedPosts {
  instagram: string;
  linkedin: string;
  twitter: string;
  milestoneType: string;
  milestoneMessage: string;
  imagePrompt: string;
  imageStyle: 'Cinematic' | 'Moody' | 'Surreal';
  audience: AudienceMode;
  imageBuffer?: Buffer;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  url: string;
  description: string;
}

export interface NewsItem {
  title: string;
  description: string;
  source: string;
  pubDate: string;
  link: string;
}

export interface VerifiedStory {
  youtubeVideo: YouTubeVideo;
  matchingNews: NewsItem[];
  matchScore: number;
}

export interface CommentaryPost {
  instagram: string;
  linkedin: string;
  twitter: string;
  sourceStory: {
    title: string;
    url: string;
    newsSources: string[];
  };
  imagePrompt: string;
  imageStyle: 'Cinematic' | 'Moody' | 'Surreal';
  audience: AudienceMode;
  imageBuffer?: Buffer;
}

export interface MilestoneEvent {
  hasMilestone: boolean;
  type:
    | 'COUNT_MILESTONE'
    | 'FIRST_FEMALE'
    | 'FIRST_NEW_CITY'
    | 'DAILY_UPDATE'
    | 'WEEKLY_SUMMARY'
    | 'VIEW_MILESTONE'
    | 'COLLABORATION_MILESTONE'
    | 'CITY_MILESTONE'
    | 'NONE';
  message: string;
  data: GrowthData;
}
