export type AudienceMode = 'general' | 'filmmaker' | 'industry';

const SCHEDULE: Record<number, AudienceMode> = {
  1: 'filmmaker',  // Monday
  5: 'industry',   // Friday
};

export function getAudienceMode(): AudienceMode {
  const override = process.env.ARIA_AUDIENCE_OVERRIDE?.toLowerCase().trim();
  if (override === 'filmmaker' || override === 'industry' || override === 'general') {
    console.log(`   Audience mode: ${override} (manual override)`);
    return override;
  }

  const day = new Date().getDay();
  const scheduled = SCHEDULE[day] ?? 'general';
  console.log(`   Audience mode: ${scheduled} (auto — day ${day})`);
  return scheduled;
}

export function audienceContext(mode: AudienceMode): string {
  switch (mode) {
    case 'filmmaker':
      return `Today you are writing directly for EMERGING FILMMAKERS — actors, directors, crew, writers at the beginning of their careers. Speak to them personally. This post is about them and for them. Use "you" directly.`;
    case 'industry':
      return `Today you are writing for INDUSTRY PROFESSIONALS — producers, casting directors, talent scouts, OTT executives. Show them what they are missing. Make the talent pipeline case. Be compelling, not pleading.`;
    default:
      return `Today you are writing for a GENERAL AUDIENCE — filmmakers, film lovers, industry observers, and the curious public. Tell the CineGrok story broadly.`;
  }
}
