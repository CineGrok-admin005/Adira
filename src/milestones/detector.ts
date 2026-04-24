import { GrowthData, MilestoneEvent } from '../types';

export function detectMilestone(data: GrowthData): MilestoneEvent {
  // Priority 1: Count milestone (e.g. first 10, 25, 50, 100 real users)
  if (data.milestoneHit) {
    return {
      hasMilestone: true,
      type: 'COUNT_MILESTONE',
      message: `CineGrok just crossed ${data.milestoneHit} filmmakers on the platform!`,
      data,
    };
  }

  // Priority 2: First female filmmaker (detected via pronouns containing 'she')
  if (data.firstFemaleFilmmaker && data.newToday > 0) {
    const f = data.firstFemaleFilmmaker;
    return {
      hasMilestone: true,
      type: 'FIRST_FEMALE',
      message: `First female filmmaker on CineGrok: a ${f.primaryRole} from ${f.city}${f.state ? ', ' + f.state : ''}.`,
      data,
    };
  }

  // Priority 3: First filmmaker from a city new to the platform
  if (data.firstFromNewCity) {
    const c = data.firstFromNewCity;
    return {
      hasMilestone: true,
      type: 'FIRST_NEW_CITY',
      message: `CineGrok just reached ${c.city}${c.state ? ', ' + c.state : ''} for the first time — a ${c.primaryRole} joined!`,
      data,
    };
  }

  // Priority 4: Daily update — any real new joiners today
  if (data.newToday > 0) {
    return {
      hasMilestone: true,
      type: 'DAILY_UPDATE',
      message: `${data.newToday} new filmmaker(s) joined CineGrok today. Total community: ${data.totalRealUsers}.`,
      data,
    };
  }

  // Priority 5: Weekly summary on Mondays
  const today = new Date().getDay();
  if (today === 1 && data.newThisWeek > 0) {
    return {
      hasMilestone: true,
      type: 'WEEKLY_SUMMARY',
      message: `${data.newThisWeek} filmmakers joined CineGrok this week. The community keeps growing!`,
      data,
    };
  }

  return { hasMilestone: false, type: 'NONE', message: '', data };
}
