require('ts-node').register({ transpileOnly: true });
const { findUnsourcedNumbers, extractProperNounTags } = require('../src/aria/qualityGate.ts');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const SRC = 'CBFC rejected Sahiya twice in 13 days under Section 5B(2). Director Sanjay Sharma said he may go to court. Sharma called the notes vague. Sharma filed an RTI.';
const YEAR = String(new Date().getFullYear());

console.log('=== the Udta Punjab regression: a wrong year rode in unchecked ===');
t('historical year absent from source is flagged',
  findUnsourcedNumbers('This echoes the 2018 Udta Punjab controversy.', SRC), ['2018']);
t('the current year is still allowed (a post may date itself)',
  findUnsourcedNumbers(`As of ${YEAR}, nothing has changed.`, SRC), []);
t('a year that IS in the source passes',
  findUnsourcedNumbers('Back in 2016 the board did this.', SRC + ' It happened in 2016.'), []);
t('sourced figures still pass', findUnsourcedNumbers('rejected twice in 13 days', SRC), []);
t('invented crore figure still caught',
  findUnsourcedNumbers('The film grossed 200 crore.', SRC), ['200 crore']);
t('small unsourced counts still ignored',
  findUnsourcedNumbers('There were 2 rejections.', SRC), []);

console.log('\n=== a tag should name the whole person ===');
const tags = extractProperNounTags(SRC, 4);
console.log('   extracted:', tags.join(' '));
t('prefers the full name', tags.includes('#SanjaySharma'), true);
t('drops the surname-only tag', tags.includes('#Sharma'), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
