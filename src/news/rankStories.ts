import { VerifiedStory } from '../types';

// Pre-filter and re-rank candidate stories BEFORE the model sees them, so the rich article
// content lands on stories actually worth grounding — not celebrity quotes or gossip.
// The 70B model ignores prose SKIP rules, so we enforce the beat here in code.

// Marketing assets — never a "story" for our beat. Always dropped, even for big-studio films.
const HARD_SKIP = [
  /\b(song|music|lyric(al)?|audio launch|first single|jukebox|teaser|trailer|\bOST\b|promo)\b/i,
  /\b(out now|watch now|streaming now|in cinemas|in theat(re|er)s|book tickets)\b/i,
];

// The real dividing line is not the TOPIC, it is the SUBJECT: "the ones becoming — not the
// ones who already made it" (characterCard.ts). Box office proves this. A blockbuster's
// ₹10,925 crore worldwide gross is noise to someone with nothing on their reel. An
// independent film clearing ₹50 crore on a ₹2 crore budget is the most on-beat story we can
// run — it is evidence that people like them can win. Same topic, opposite value.
//
// So earnings and interviews live in SOFT_SKIP: dropped by default, RESCUED when the story
// also carries an emerging/independent signal from BOOST. Only marketing assets — songs,
// trailers, promos — are unconditional, because those are never a story about anyone.

// Off-beat noise — dropped UNLESS the story also carries a real industry-decision signal
// (e.g. "festival lineup revealed amid controversy" should survive on the festival angle).
const SOFT_SKIP = [
  /\b(gossip|dating|girlfriend|boyfriend|wedding|marriage|divorce|spotted|airport|birthday|vacation|cute|adorable)\b/i,
  // Earnings language, redeemable: "₹50 crore NFDC fund" survives on the funding BOOST,
  // "₹10,925 crore worldwide gross" does not.
  /\b(box.?office|worldwide gross|opening day|weekend collection|day \d+ (collection|nett)|footfalls?|occupancy|screen count)\b/i,
  /\b(crore|collections?|earnings|grosses|record[- ]?breaking)\b/i,
  // Personal/family content. "Suriya & Jyotika share on their kids keeping them grounded"
  // passed every other filter — it is celebrity human-interest, not an industry decision.
  /\b(kids?|children|family|wife|husband|son|daughter|parents?|personal life|grounded|home life)\b/i,
  // Retrospective career interviews. Same rule as box office — the format is fine, the
  // subject decides. "Ravi Basrur on his journey composing for KGF" is a made-it looking
  // back; "first-time director opens up on her ₹5 lakh debut" is rescued by the debut boost.
  // Deliberately narrower than SOFT_PENALTY below: "says" and "shares" stay a nudge, not a
  // drop, because they appear in ordinary industry reporting too.
  /\b(on (his|her) (journey|career|struggle|success)|looks? back|recalls?|reflects? on|reminisces|success story|rise to fame|\d+\s*years? of|anniversary|reunion|revisit(ing)?|candid (chat|conversation)|throwback)\b/i,
  // The YouTube channels post in Hindi, so English-only patterns miss half the noise.
  // (Largely moot once YouTube is dropped as a source, but free to keep for Hindi headlines.)
  /(स्क्रीन|कलेक्शन|बॉक्स\s*ऑफिस|रिकॉर्ड|कमाई|टूटेगा)/,
  /\b(politic|election|minister|\bMP\b|\bMLA\b|party|vote|rally|protest)\b/i,
  /\b(controvers|slam|troll|backlash|feud|fight|arrest|\bFIR\b|legal notice|defam)\b/i,
  /\b(horoscope|fashion|red carpet|filmfare|award show|recap|throwback)\b/i,
];

// Industry-decision signals that matter to an emerging filmmaker — boost these.
const BOOST = [
  /\b(greenlit|greenlight|commission|slate|line[- ]?up|selection|selected|in competition|premiere)\b/i,
  /\b(NFDC|grant|fund(ing)?|scholarship|fellowship|residency|film bazaar)\b/i,
  /\b(debut|first film|first feature|newcomer|emerging|breakout|discovered)\b/i,
  // The rescue signals. These are what turn an off-beat topic back into our story: an
  // independent film's box office IS the beat, a first-time director's interview IS the beat.
  /\b(independent|indie|low[- ]?budget|micro[- ]?budget|no[- ]?budget|shoestring|self[- ]?fund|crowdfund|made for (just |only )?[₹$])\b/i,
  /\b(first[- ]?time|debutant|student film|short film|regional cinema|small(er)? film|underdog|against the odds)\b/i,
  /\b(acqui(re|red|sition)|picked up|streaming rights|OTT rights|original (series|film))\b/i,
];

// WEAK signals: good for RANKING, useless for RESCUE. "producer" appears in nearly every
// film news item — it rescued the Ramayana box-office story straight past the beat filter
// on 2026-08-09, because SOFT_SKIP was redeemed by ANY boost. These now only move a story
// up the order; they can never bring a dropped one back.
const WEAK_BOOST = [
  // A bare festival NAME is not itself news — it is often just where an interview or
  // retrospective chat was filmed. "greenlit/commission/slate/lineup/selection/premiere"
  // above already covers real festival programming decisions. Moved here 2026-08-26 after
  // it rescued a 15th-anniversary retrospective chat ("On 15 Years Of Delhi Belly... Nilaya
  // Monsoon Film Festival") that the anniversary pattern in SOFT_SKIP had correctly dropped.
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
    const weak = WEAK_BOOST.filter(p => p.test(blob)).length;
    const hardSkip = HARD_SKIP.some(p => p.test(title));
    const softSkip = SOFT_SKIP.some(p => p.test(title));
    const softPenalty = SOFT_PENALTY.test(title) ? 1 : 0;
    const score = s.matchScore + boosts * 2 + weak * 0.5 - softPenalty;

    // Rescue must come from the TITLE, not the blob. The blob includes matched news
    // descriptions, so an unrelated article mentioning "debut" could rescue a box-office
    // story it has nothing to do with — which is how the Ramayana piece survived twice.
    const rescued = BOOST.some(p => p.test(title));
    const drop = hardSkip || (softSkip && !rescued);
    return { s, score, drop };
  });

  const kept = scored.filter(x => !x.drop);

  // Return EMPTY when everything was filtered. This used to fall back to the unfiltered set,
  // which silently defeated the whole filter on exactly the days it mattered most — a day of
  // nothing but gossip and box office would publish gossip and box office. An empty pool makes
  // the caller emit NO_WORTHWHILE_STORY and post nothing, which is the correct outcome:
  // the content plan's rule is that silence beats filler.
  if (kept.length === 0) {
    console.log(`   🚫 rankStories: all ${stories.length} candidate(s) failed the beat filter — nothing worth posting.`);
    return [];
  }

  return kept.sort((a, b) => b.score - a.score).map(x => x.s);
}
