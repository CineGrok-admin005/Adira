require('ts-node').register({ transpileOnly: true });
const { capQuestions } = require('../src/aria/qualityGate.ts');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};
const qs = (s) => (s.match(/\?/g) || []).length;

console.log('=== the belief-correction regression ===');
const many = `Most beginners believe three lights are mandatory.

So why does this myth persist? It persists because rental houses sell kits.

It costs people money they do not have. Who benefits from that? Nobody on set.

Who taught you the version you believed?

#CineGrok #Lighting`;
const out = capQuestions(many);
t('reduces 3 questions to 1', qs(out), 1);
t('the one kept is the closing question', out.includes('Who taught you the version you believed?'), true);
t('non-question prose survives intact', out.includes('It persists because rental houses sell kits.'), true);
t('the second body question is gone', out.includes('Who benefits from that?'), false);
t('surrounding sentences in that line survive', out.includes('Nobody on set.'), true);
t('hashtags untouched', out.includes('#CineGrok #Lighting'), true);
t('no triple blank lines left behind', /\n{3,}/.test(out), false);

console.log('\n=== leaves compliant posts alone ===');
const one = 'A flat statement.\n\nWhat were you taught?\n\n#CineGrok #X';
t('exactly one question is untouched', capQuestions(one), one);
t('zero questions is untouched', capQuestions('No questions here.'), 'No questions here.');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
