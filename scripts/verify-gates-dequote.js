require('ts-node').register({ transpileOnly: true });
const { stripUnattributedUnsourcedQuotes, findUnsourcedQuotes } = require('../src/aria/qualityGate.ts');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

const SRC = 'CBFC rejected the film citing “excessive violence and insensitivity to societal norms”. Director Sanjay Sharma said the board never named a scene.';

console.log('=== the flourish that killed a sound post ===');
const flourish = 'The film belongs to “the universal language of Indian cinema’s golden age.” It was rejected twice.';
const out = stripUnattributedUnsourcedQuotes(flourish, SRC);
t('quotation marks removed', /[“”]/.test(out), false);
t('the words survive', out.includes('the universal language of Indian cinema’s golden age.'), true);
t('the rest of the sentence survives', out.includes('It was rejected twice.'), true);
t('gate now sees no unsourced quote', findUnsourcedQuotes(out, SRC), []);

console.log('\n=== a real quote from the source keeps its marks ===');
const real = 'The board cited “excessive violence and insensitivity to societal norms”.';
t('untouched', stripUnattributedUnsourcedQuotes(real, SRC), real);

console.log('\n=== a fabricated ATTRIBUTED quote is never laundered ===');
const fake = 'Sanjay Sharma said “the board is run by cowards who have never made a film.”';
const kept = stripUnattributedUnsourcedQuotes(fake, SRC);
t('quotation marks retained', kept, fake);
t('still reported as unsourced, so it is rejected', findUnsourcedQuotes(kept, SRC).length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
