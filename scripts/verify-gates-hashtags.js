require('ts-node').register({ transpileOnly: true });
const { ensureHashtags, extractProperNounTags } = require('../src/aria/qualityGate.ts');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};
const tags = (s) => s.match(/#\w+/g) || [];

const SRC = 'Sahiya director slams CBFC over certification delay. The director said Sahiya has been pending for months and he is prepared to approach the High Court.';

console.log('=== the actual regression: zero hashtags ===');
const zero = ensureHashtags('A film sat in limbo for months.\n\nWhat would you do?', SRC);
t('backfills to exactly 2', tags(zero).length, 2);
t('every tag is grounded in the source or is #CineGrok',
  tags(zero).every((x) => SRC.replace(/\s/g, '').toLowerCase().includes(x.slice(1).toLowerCase()) || x === '#CineGrok'), true);
t('body text is preserved', zero.includes('A film sat in limbo for months.'), true);

console.log('\n=== the other directions ===');
t('one tag gets topped up to 2', tags(ensureHashtags('Body here.\n\n#Sahiya', SRC)).length, 2);
t('appends onto the existing tag line, not a new one',
  ensureHashtags('Body here.\n\n#Sahiya', SRC).split('\n').filter((l) => /#\w+/.test(l)).length, 1);
t('exactly 2 is left alone', ensureHashtags('Body.\n\n#Sahiya #CBFC', SRC), 'Body.\n\n#Sahiya #CBFC');
t('four are still capped to 2', tags(ensureHashtags('Body.\n\n#A1 #B2 #C3 #D4', SRC)).length, 2);
t('no duplicate when the tag is already present',
  new Set(tags(ensureHashtags('Body.\n\n#Sahiya', SRC)).map((x) => x.toLowerCase())).size, 2);

console.log('\n=== proper-noun extraction is not garbage ===');
const ex = extractProperNounTags(SRC, 5);
console.log('   extracted:', ex.join(' '));
t('picks the film name', ex.includes('#Sahiya'), true);
t('drops sentence-opening stopwords', ex.includes('#The'), false);
t('empty source falls back to #CineGrok only', tags(ensureHashtags('Body.', '')), ['#CineGrok']);

console.log('\n=== a tag must name what the POST is about ===');
// The 2026-09-03 regression: "Radhika Gupta" is in the article, never in the post.
const CAST = 'Prime Video India released a Top 5 Moments video for The Traitors Season 2. ' +
  'Radhika Gupta appears briefly. Karan Johar returns as game-master for the season.';
const postAbout = ensureHashtags('Prime Video India framed the reality series as a talent showcase.', CAST);
t('does not tag a name absent from the post', tags(postAbout).includes('#RadhikaGupta'), false);
t('tags a name the post actually uses', tags(postAbout).includes('#PrimeVideoIndia'), true);
t('still lands exactly 2', tags(postAbout).length, 2);
console.log('   chose:', tags(postAbout).join(' '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
