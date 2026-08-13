/* Dependency-free test suite: node test/lengths.test.js */
'use strict';

var L = require('../lengths.js');

var passed = 0;
var failures = [];

function check(name, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failures.push(name + '\n    expected: ' + JSON.stringify(expected) +
                  '\n    actual:   ' + JSON.stringify(actual));
  }
}

function inches(text) {
  var p = L.parse(text, { allowBareNumber: true });
  return p.ok ? L.toNumber(p.inches) : p.error;
}

function apply(text, delta, op, denom) {
  var d = L.parse(delta, { allowBareNumber: true });
  if (!d.ok) return 'delta:' + d.error;
  var r = L.applyDelta(text, d.inches, op || 'add', denom || 16);
  return r.ok ? r.text : r.error;
}

/* ---------------------------------------------------------------- *
 * Parsing values
 * ---------------------------------------------------------------- */

check('feet + inches', inches('6 ft 3 in'), 75);
check('no space', inches('6ft 3in'), 75);
check('symbols', inches('6\'3"'), 75);
check('architectural dash', inches('5\'-6"'), 66);
check('mixed number', inches('6 ft 3 1/2 in'), 75.5);
check('trailing bare fraction', inches('I am 6ft, 3in and 1/2 tall'), 75.5);
check('bare fraction onto feet', inches('6 ft and 1/2'), 78);
check('decimal feet', inches('6.5 ft'), 78);
check('inches only', inches('18 in'), 18);
check('fraction only', inches('1/2 in'), 0.5);
check('leading-dot decimal', inches('.5 in'), 0.5);
check('word units', inches('6 feet 3 inches'), 75);
check('abbrev periods', inches('6 ft. 3 in.'), 75);
check('double-prime inches', inches("5' 6''"), 66);
check('curly quotes', inches('5’ 6”'), 66);
check('bare number as inches', inches('3 1/2'), 3.5);
check('embedded in prose', inches('The header is 12 ft 4 in long, roughly.'), 148);

/* ---------------------------------------------------------------- *
 * Written without spaces
 * ---------------------------------------------------------------- */

check('glued units', inches('6ft3in'), 75);
check('glued units in prose', inches('I am 6ft3in and 1/2 tall'), 75.5);
check('glued two-digit', inches('The room is 12ft6in wide'), 150);
check('glued word units with fraction', inches('6ft3 1/2in'), 75.5);
check('glued symbols', inches('5\'6"'), 66);

// A number glued onto a feet marker with no unit of its own is inches.
check('bare inches glued to symbol', inches('5\'6'), 66);
check('bare inches glued to word unit', inches('6ft2'), 74);
check('bare glued mixed number', inches('5\'6 1/2'), 66.5);

// ...but only when glued. With a space it is an ordinary prose number.
check('spaced number is not inches', inches('6 ft 2'), 72);
check('spaced number in prose', inches('the 6 ft 2 boards'), 72);

// The unit must still not swallow a longer word.
check('"int" is not inches', inches('I need 6 int the corner'), 'none');
check('"info" is not inches', inches('see 6 info sheets'), 'none');
check('"footing" is not feet', inches('pour 6 footings today'), 'none');

check('add to glued input',
  apply('I am 6ft3in and 1/2 tall', '1/2 in'),
  'I am 6ft4in tall');

check('add to glued symbols',
  apply('The beam is 5\'6" long', '2 in'),
  'The beam is 5\'8" long');

check('bare glued inches gain a marker on output',
  apply("a 5'6 opening", '2 in'),
  'a 5\'8" opening');

/* ---------------------------------------------------------------- *
 * Rejecting ambiguous input
 * ---------------------------------------------------------------- */

check('two measurements', inches('an 8 ft wall and a 3 ft door'), 'multiple');
check('two symbol measurements', inches('cut 2\' off the 8\' board'), 'multiple');
check('repeated feet', inches('6 ft 7 ft'), 'multiple');
check('no measurement', inches('nothing here'), 'none');
check('bare number in prose is not a measurement', inches('I have 3 boards'), 'none');

// Numbers in the surrounding prose must not be mistaken for parts of the
// measurement, and must not trip the "more than one" guard either.
check('prose number ignored', inches('Order 3 of the 6 ft 2 in posts'), 74);
check('unrelated fraction ignored', inches('The 6 ft board costs 1/2 the price'), 72);

/* ---------------------------------------------------------------- *
 * Adding and subtracting, preserving surrounding text
 * ---------------------------------------------------------------- */

check('add, prose preserved',
  apply('I am 6ft, 3in and 1/2 tall', '1 in'),
  'I am 6ft, 4 1/2in tall');

check('add, collapsing the scattered fraction',
  apply('I am 6ft, 3in and 1/2 tall', '1/2 in'),
  'I am 6ft, 4in tall');

check('add to symbol notation',
  apply('The beam is 5\'-6" long', '3 1/2 in'),
  'The beam is 5\'-9 1/2" long');

check('subtract',
  apply('cut the 8 ft 0 in stud', '3 1/4 in', 'subtract'),
  'cut the 7 ft 8 3/4 in stud');

check('subtract past zero goes negative',
  apply('a 2 in gap', '5 in', 'subtract'),
  'a -3 in gap');

check('carry into feet',
  apply('6 ft 11 in', '2 in'),
  '7 ft 1 in');

check('inches-only stays inches-only',
  apply('a 10 in board', '5 in'),
  'a 15 in board');

check('feet-only grows an inches part',
  apply('an 8 ft board', '3 in'),
  'an 8 ft 3 in board');

check('feet-only symbol grows inches',
  apply("an 8' board", '3 in'),
  'an 8\'3" board');

check('drops zero feet',
  apply('0 ft 2 in', '3 in'),
  '5 in');

check('word units echoed',
  apply('6 feet 3 inches', '1 inch'),
  '6 feet 4 inches');

check('separator echoed',
  apply('6 ft. 3 in. board', '1 in'),
  '6 ft. 4 in. board');

check('rounding to 1/16 by default',
  apply('1 in', '0.03 in'),
  '1 in');

check('rounding to 1/32',
  apply('1 in', '1/32 in', 'add', 32),
  '1 1/32 in');

check('coarse rounding to 1/4',
  apply('1 in', '1/8 in', 'add', 4),
  '1 1/4 in');

check('bare second input treated as inches',
  apply('a 6 ft 1 in post', '2 1/2'),
  'a 6 ft 3 1/2 in post');

check('error surfaces on ambiguous first input',
  apply('an 8 ft wall and a 3 ft door', '1 in'),
  'multiple');

/* ---------------------------------------------------------------- *
 * Exact arithmetic
 * ---------------------------------------------------------------- */

check('thirds are exact',
  L.toNumber(L.add(L.add(L.rat(1, 3), L.rat(1, 3)), L.rat(1, 3))),
  1);

check('sixteenths survive many additions', (function () {
  var total = L.rat(0, 1);
  for (var i = 0; i < 100; i++) total = L.add(total, L.rat(1, 16));
  return L.toNumber(total);
})(), 6.25);

/* ---------------------------------------------------------------- */

console.log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  failures.forEach(function (f) { console.log('\n  FAIL ' + f); });
  process.exit(1);
}
