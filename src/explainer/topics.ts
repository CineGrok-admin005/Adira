import type { ExplainerPillar } from '../types';

export interface ExplainerTopic {
  pillar: ExplainerPillar;
  topic: string;
}

// Static, hand-curated seed bank for the Explainer pipeline. Each entry is handed to the LLM
// verbatim as the one thing to write about — this keeps output specific instead of generic,
// and keeps any invented-fact risk confined to what's reviewed here rather than what the model
// free-associates. Skim/edit this list before it goes live, especially TOOLS_AND_RESOURCES —
// see the hallucination-risk note in generateExplainer.ts.
export const EXPLAINER_TOPICS: ExplainerTopic[] = [
  // ── CRAFT BREAKDOWN — one technique, named, shown, explained ──
  { pillar: 'CRAFT_BREAKDOWN', topic: 'the 180-degree rule and when Indian arthouse cinema deliberately breaks it' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'match cuts vs jump cuts — when each keeps immersion and when each breaks it' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'the Kuleshov effect — why the same neutral face reads as a different emotion depending on the shot before it' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'blocking three actors in one small room without it feeling like a filmed stage play' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'practical lighting vs movie lighting — motivating every visible light source in the frame' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'sound design as a budget multiplier — why a moment of true silence costs nothing and does the most' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'color grading vs color correction — what each one is actually for, and which one most beginners skip' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'the rule of thirds vs dead-center framing — when centering the subject is the stronger directorial choice' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'diegetic vs non-diegetic sound — using score sparingly enough that it still lands when it arrives' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'coverage — the minimum set of shots a no-budget crew must get to survive the edit' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'foreshadowing through production design and framing instead of a line of dialogue' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'using negative space in a frame to make a small, cheap location read as bigger than it is' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'match-on-action cuts — the editing technique that hides a location or budget limitation' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'subtext in blocking — what physical distance between two characters says without a line being spoken' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'handheld vs gimbal vs locked-off — matching camera movement to the emotional stakes of a scene' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'the wide-medium-close pattern and why breaking it on purpose is what makes a scene memorable' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'using a single practical prop as a recurring visual motif instead of writing the theme in dialogue' },
  { pillar: 'CRAFT_BREAKDOWN', topic: 'the difference between a establishing shot that\'s doing narrative work and one that\'s just filler' },

  // ── EDUCATIONAL FRAMEWORK — a step-by-step decision system, scannable and usable ──
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'a 4-question framework for deciding handheld vs. locked-off for any given scene' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'the shot list a 1-person crew actually needs before day one — not the shot list a full crew would write' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'how to break a scene into its coverage shots in under ten minutes' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'a pre-production checklist sized honestly for a zero-budget short, not a studio production' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'deciding your aspect ratio before you shoot, not fixing it in the edit' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'a 3-question test for whether a scene genuinely needs a second location or is just chasing production value' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'a framework for casting a short film when you can\'t pay actors' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'structuring a short shoot schedule around available daylight instead of fighting it' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'a simple continuity-notes system for a set with no script supervisor' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'storyboarding on paper in an afternoon — no software required' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'a decision framework for choosing your one lead lens before day one instead of over-packing a kit' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'the "can I explain this shot in one sentence" test before committing a whole setup to it' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'turning a film festival\'s submission requirements into one working checklist' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'a framework for deciding what to cut in the edit when every scene "feels important"' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'structuring a feedback screening so the notes you get back are usable, not just opinions' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'the 2-take rule — a simple system for knowing when to move on vs when a scene needs a third take' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'the real cost centers of a short film, broken down before you ask anyone for money' },
  { pillar: 'EDUCATIONAL_FRAMEWORK', topic: 'a framework for picking the right first film festival to submit to, instead of submitting everywhere' },

  // ── TOOLS AND RESOURCES — honest, specific comparisons; no invented prices/specs ──
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'prime lens vs kit zoom — what a beginner actually loses going cheap, and what they genuinely don\'t' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'free color-grading LUTs worth using vs the ones that fight your footage instead of helping it' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'a phone gimbal vs a secondhand slider — which one earns its keep on a real short film shoot' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'budget sound-recording setups that beat a camera\'s built-in mic without needing a full boom kit' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'DaVinci Resolve\'s free tier vs the paid version — what a short film actually needs and what it doesn\'t' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'continuity-tracking apps that can stand in for a script supervisor on a no-crew shoot' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'a reflector board vs buying an extra light — the cheap fix that does more than people expect' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'royalty-free score libraries that don\'t sound like royalty-free score libraries' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'buying secondhand vs new — where it genuinely saves money on camera gear and where it doesn\'t' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'free storyboard and shot-list templates worth using instead of building your own from scratch' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'a basic 3-light setup vs shooting entirely with available light — when each is the right call' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'wireless lavalier mics on a budget — what actually holds up through a full day of shooting' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'editing on a laptop — the honest minimum that won\'t fight you halfway through a project' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'film grant and funding databases worth checking before assuming there\'s no money to apply for' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'subtitle and captioning tools that handle Indian language scripts without mangling them' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'backup workflows for a shoot with no dedicated assistant editor' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'public domain and Creative Commons footage sources worth knowing for cutaways' },
  { pillar: 'TOOLS_AND_RESOURCES', topic: 'film festival submission platforms — which ones actually get a film seen vs which just collect a fee' },
];
