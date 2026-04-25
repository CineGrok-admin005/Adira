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

  // Engagement
  totalProfileViews: number;
  totalProfileClicks: number;
  weeklyProfileViews: number;   // views on profiles published in the last 7 days

  // Platform depth
  openToCollaborations: number; // filmmakers actively open to working together
  uniqueCities: number;         // how many cities CineGrok covers
  uniqueStates: number;         // how many Indian states
  foundingMemberCount: number;  // profiles with a founding_member_number

  // Community composition
  roleBreakdown: Record<string, number>;  // primary role → count
  topGenres: string[];                    // top 5 genres across all filmmakers
  multiRoleCount: number;                 // filmmakers with secondary roles too
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
