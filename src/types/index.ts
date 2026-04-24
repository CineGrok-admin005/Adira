export type AudienceMode = 'general' | 'filmmaker' | 'industry';

export interface GrowthData {
  totalRealUsers: number;
  newToday: number;
  newThisWeek: number;
  recentPublicJoiners: PublicJoiner[];
  firstFemaleFilmmaker: PublicJoiner | null;
  firstFromNewCity: PublicJoiner | null;
  milestoneHit: number | null;
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
  type: 'COUNT_MILESTONE' | 'FIRST_FEMALE' | 'FIRST_NEW_CITY' | 'DAILY_UPDATE' | 'WEEKLY_SUMMARY' | 'NONE';
  message: string;
  data: GrowthData;
}
