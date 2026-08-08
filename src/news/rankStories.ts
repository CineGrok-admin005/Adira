import { VerifiedStory } from '../types';

// Pre-filter and re-rank candidate stories BEFORE the model sees them, so the rich article
// content lands on stories actually worth grounding — not celebrity quotes or gossip.
// The 70B model ignores prose SKIP rules, so we enforce the beat here in code.

// Marketing assets — never a "story" for our beat. Always dropped, even for big-studio films.
const HARD_SKIP = [
  /\b(song|music|lyric(al)?|audio launch|first single|jukebox|teaser|trailer|\bOST\b|promo)\b/i,
  /\b(out now|watch now|streaming now|in cinemas|in theat(re|er)s|book tickets)\b/i,
];

// Off-beat noise — dropped UNLESS the story also carries a real industry-decision signal
// (e.g. "festival lineup revealed amid controversy" should survive on the festival angle).
const SOFT_SKIP = [
  /\b(gossip|dating|girlfriend|boyfriend|wedding|marriage|divorce|spotted|airport|birthday|vacation|cute|adorable)\b/i,
  /\b(politic|election|minister|\bMP\b|\bMLA\b|party|vote|rally|protest)\b/i,
  /\b(controvers|slam|troll|backlash|feud|fight|arrest|\bFIR\b|legal notice|defam)\b/i,
  /\b(horoscope|fashion|red carpet|filmfare|award show|recap|throwback)\b/i,
];

// Industry-decision signals that matter to an emerging filmmaker — boost these.
const BOOST = [
  /\b(greenlit|greenlight|commission|slate|line[- ]?up|selection|selected|in competition|premiere)\b/i,
  /\b(NFDC|grant|fund(ing)?|scholarship|fellowship|residency|film bazaar)\b/i,
  /\b(debut|first film|first feature|newcomer|emerging|breakout|discovered)\b/i,
  /\b(acqui(re|red|sition)|picked up|streaming rights|OTT rights|original (series|film))\b/i,
  /\b(festival|MAMI|IFFI|IFFK|Cannes|Sundance|Berlinale|Venice|TIFF|Toronto)\b/i,
  /\b(production house|studio|backed by|co[- ]?produce|producer)\b/i,
  /\b(casting call|open call|audition|submission|apply now)\b/i,
];

// Interview/quote fluff — not dropped (can be career-journey gold), just nudged down so a real
// industry story outranks "actor reveals what they look for in a script".
const SOFT_PENALTY = /\b(reveals?|opens up|talks about|reacts?|interview|in conversation|says|shares?)\b/i;

function blobOf(s: VerifiedStory): string {
  return [
    s.youtubeVideo.title,
    s.youtubeVideo.description,
    ...s.matchingNews.map(n => `${n.title} ${n.description}`),
  ].join(' ');
}

export function rankStories(stories: VerifiedStory[]): VerifiedStory[] {
  const scored = stories.map(s => {
    const title = s.youtubeVideo.title || '';
    const blob = blobOf(s);
    const boosts = BOOST.filter(p => p.test(blob)).length;
    const hardSkip = HARD_SKIP.some(p => p.test(title));
    const softSkip = SOFT_SKIP.some(p => p.test(title));
    const softPenalty = SOFT_PENALTY.test(title) ? 1 : 0;
    const score = s.matchScore + boosts * 2 - softPenalty;
    // Always drop pure marketing; drop off-beat noise only when nothing redeems it.
    const drop = hardSkip || (softSkip && boosts === 0);
    return { s, score, drop };
  });

  const kept = scored.filter(x => !x.drop);
  // Never return empty — if everything was filtered, fall back to the original scored set.
  const pool = kept.length > 0 ? kept : scored;
  return pool.sort((a, b) => b.score - a.score).map(x => x.s);
}
