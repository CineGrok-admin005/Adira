import { GrowthData, MilestoneEvent } from '../types';

const VIEW_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000];
const CITY_MILESTONES = [5, 10, 15, 20, 25, 30, 50];

function crossedToday(milestones: number[], current: number, addedToday: number): number | null {
  return milestones.find(m => current >= m && current - addedToday < m) ?? null;
}

export function detectAllMilestones(data: GrowthData): MilestoneEvent[] {
  const milestones: MilestoneEvent[] = [];

  // Priority 1: Signup count milestone
  if (data.milestoneHit) {
    milestones.push({
      hasMilestone: true,
      type: 'COUNT_MILESTONE',
      message: `CineGrok just crossed ${data.milestoneHit} filmmakers on the platform!`,
      data,
    });
  }

  // Priority 2: First female filmmaker
  if (data.firstFemaleFilmmaker && data.newToday > 0) {
    const f = data.firstFemaleFilmmaker;
    milestones.push({
      hasMilestone: true,
      type: 'FIRST_FEMALE',
      message: `First female filmmaker on CineGrok: a ${f.primaryRole} from ${f.city}${f.state ? ', ' + f.state : ''}.`,
      data,
    });
  }

  // Priority 3: First filmmaker from a new city
  if (data.firstFromNewCity) {
    const c = data.firstFromNewCity;
    milestones.push({
      hasMilestone: true,
      type: 'FIRST_NEW_CITY',
      message: `CineGrok just reached ${c.city}${c.state ? ', ' + c.state : ''} for the first time — a ${c.primaryRole} joined!`,
      data,
    });
  }

  // Priority 4: Profile view milestone crossed today — use TODAY's views only
  const viewMilestone = crossedToday(VIEW_MILESTONES, data.totalProfileViews, data.todayProfileViews);
  if (viewMilestone) {
    milestones.push({
      hasMilestone: true,
      type: 'VIEW_MILESTONE',
      message: `CineGrok profiles have been viewed ${viewMilestone.toLocaleString()} times in total. Someone is always watching.`,
      data,
    });
  }

  // Priority 5: City count milestone — only fire if a new city was added today
  const cityMilestone = data.firstFromNewCity
    ? CITY_MILESTONES.find(m => data.uniqueCities === m)
    : null;
  if (cityMilestone) {
    milestones.push({
      hasMilestone: true,
      type: 'CITY_MILESTONE',
      message: `CineGrok now has filmmakers from ${cityMilestone} cities across India.`,
      data,
    });
  }

  // Priority 6: Daily update — any new joiners today
  if (data.newToday > 0) {
    milestones.push({
      hasMilestone: true,
      type: 'DAILY_UPDATE',
      message: `${data.newToday} new filmmaker(s) joined CineGrok today. Total: ${data.totalRealUsers}.`,
      data,
    });
  }

  // Priority 7: Weekly summary on Mondays
  const today = new Date().getDay();
  if (today === 1 && data.newThisWeek > 0) {
    milestones.push({
      hasMilestone: true,
      type: 'WEEKLY_SUMMARY',
      message: `${data.newThisWeek} filmmakers joined CineGrok this week. ${data.totalProfileViews} total profile views. ${data.openToCollaborations} open to collaborations.`,
      data,
    });
  }

  return milestones;
}

export function detectMilestone(data: GrowthData): MilestoneEvent {
  const all = detectAllMilestones(data);
  return all.length > 0 ? all[0] : { hasMilestone: false, type: 'NONE', message: '', data };
}
