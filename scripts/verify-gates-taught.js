require('ts-node').register({ transpileOnly: true });
const { findAttributedQuotes, findUnsourcedDates } = require('../src/aria/qualityGate.ts');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

console.log('=== the belief-correction regression: quoting a misconception is the shape ===');
// Verbatim from the 2026-09-03 rejection.
t('bare misconception is allowed',
  findAttributedQuotes('Everyone repeats it: “you need three lights to look professional.” It is wrong.'), []);
t('the other rejected line is allowed',
  findAttributedQuotes('The belief goes “if you cannot afford a three-light kit, you are stuck shooting in the dark.”'), []);

console.log('\n=== but an unverifiable attributed quote is still blocked ===');
t('attribution verb before',
  findAttributedQuotes('Anurag Kashyap said “the three-point setup is a crutch for lazy operators.”'),
  ['the three-point setup is a crutch for lazy operators.']);
t('attribution verb after',
  findAttributedQuotes('“The three-point setup is a crutch for lazy operators,” he explained at the panel.'),
  ['The three-point setup is a crutch for lazy operators,']);
t('a bare full name nearby also counts',
  findAttributedQuotes('Ravi Varman put it plainly: “available light forces you to actually look at the room.”').length, 1);
t('short fragments are not quotes', findAttributedQuotes('Call it the “key” light.'), []);

t('a capitalised technique name in a prior sentence is NOT attribution',
  findAttributedQuotes('Use the Rule of Thirds. Beginners still think “you must center the subject to make it matter.”'), []);
t('a film title in a prior sentence is NOT attribution',
  findAttributedQuotes('Watch The Great Indian Kitchen. The myth persists that “you need a big crew to shoot a kitchen scene.”'), []);

console.log('\n=== a craft explainer has no business citing a date ===');
t('specific date is flagged when there is no source',
  findUnsourcedDates('The technique changed on September 2.', ''), ['September 2']);
t('a bare year is not a date claim', findUnsourcedDates('Shot on 35mm since 1975.', ''), []);
t('f-stops and focal lengths are untouched',
  findUnsourcedDates('A 35mm at f/1.4 and 1/48 s.', ''), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
