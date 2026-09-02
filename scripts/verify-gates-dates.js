require('ts-node').register({ transpileOnly: true });
const { findUnsourcedDates, stripMarkdown } = require('../src/aria/qualityGate.ts');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};

const SRC = 'The director slammed the CBFC over the delay and rejection of his upcoming film Sahiya, saying he is prepared to approach the High Court if the matter is not resolved soon. The film was submitted on 12 August and has been pending since.';

console.log('=== findUnsourcedDates ===');
// THE REAL REGRESSION
t('the actual fabricated date',
  findUnsourcedDates('He lodged a High Court petition on September 2.', SRC), ['September 2']);
t('date that IS in the source',
  findUnsourcedDates('Submitted on 12 August, still no certificate.', SRC), []);
t('same date, reversed order vs source',
  findUnsourcedDates('On August 12 the film went in.', SRC), []);
t('ordinal suffix still matches source',
  findUnsourcedDates('Filed August 12th.', SRC), []);
t('bare month is not a date claim',
  findUnsourcedDates('This has dragged on since August.', SRC), []);
t('bare year is not a date claim',
  findUnsourcedDates('The 2026 certification backlog.', SRC), []);
t('two fabricated dates both reported',
  findUnsourcedDates('Hearing on September 2, verdict October 9.', SRC).sort(),
  ['October 9', 'September 2']);
t('case-insensitive against source',
  findUnsourcedDates('filed on 12 august', SRC), []);

console.log('\n=== stripMarkdown ===');
// THE REAL REGRESSION
t('italic between em dashes',
  stripMarkdown('in limbo—*Sahiya*—starring Shantanu'), 'in limbo—Sahiya—starring Shantanu');
t('italic after en dash',
  stripMarkdown('the film –*Sahiya*– opens'), 'the film –Sahiya– opens');
t('italic after hyphen',
  stripMarkdown('re-*read* it'), 're-read it');
t('space-prefixed still works',
  stripMarkdown('the film *Sahiya* opens'), 'the film Sahiya opens');
t('bold still works',
  stripMarkdown('this is **very** true'), 'this is very true');
t('start of line still works',
  stripMarkdown('*Sahiya* was rejected'), 'Sahiya was rejected');
t('multiplication is not italics',
  stripMarkdown('budget 3 * 4 crore'), 'budget 3 * 4 crore');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
