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
 * Rounding direction
 * ---------------------------------------------------------------- */

function fmt(text, denom, mode) {
  var p = L.parse(text, { allowBareNumber: true });
  return L.formatInches(p.inches, { ft: null, in: { mark: ' in', space: '' }, sep: ' ' },
                        denom, mode);
}

// 1/3 in at 1/16 sits between 5/16 and 6/16.
check('nearest rounds down when below half', fmt('1/3 in', 16, 'nearest'), '5/16 in');
check('up always climbs',                    fmt('1/3 in', 16, 'up'),      '3/8 in');
check('down always drops',                   fmt('1/3 in', 16, 'down'),    '5/16 in');

// 7/12 in at 1/16 is 9.33/16 — nearest goes down, up goes to 10/16.
check('nearest rounds down from .33', fmt('7/12 in', 16, 'nearest'), '9/16 in');
check('up from .33',                  fmt('7/12 in', 16, 'up'),      '5/8 in');

// 5/8 in at 1/16 is exactly 10/16: no direction may move it.
check('exact value unmoved by nearest', fmt('5/8 in', 16, 'nearest'), '5/8 in');
check('exact value unmoved by up',      fmt('5/8 in', 16, 'up'),      '5/8 in');
check('exact value unmoved by down',    fmt('5/8 in', 16, 'down'),    '5/8 in');

// The float trap: 0.7 in * 10 / 10 must not compute as 6.99999 and floor to 6.
check('decimal on a graduation is not dropped', fmt('0.5 in', 2, 'down'), '1/2 in');
check('decimal tenth rounds down cleanly',      fmt('0.7 in', 10, 'down'), '7/10 in');

// Rounding up may carry into the next whole inch, and on into feet.
check('up carries into the next inch', fmt('2 15/16 in', 2, 'up'), '3 in');
check('down drops to the whole inch',  fmt('2 15/16 in', 2, 'down'), '2 1/2 in');

check('up carries into feet',
  L.formatInches(L.parse('11 7/8 in', {}).inches,
                 { ft: { mark: ' ft', space: '' }, in: { mark: ' in', space: '' }, sep: ' ' },
                 2, 'up'),
  '1 ft');

// Direction is signed: up means longer, down means shorter, below zero too.
check('down on a negative moves away from zero',
  L.formatInches(L.sub(L.rat(0, 1), L.rat(1, 3)),
                 { ft: null, in: { mark: ' in', space: '' }, sep: ' ' }, 16, 'down'),
  '-3/8 in');
check('up on a negative shortens the magnitude',
  L.formatInches(L.sub(L.rat(0, 1), L.rat(1, 3)),
                 { ft: null, in: { mark: ' in', space: '' }, sep: ' ' }, 16, 'up'),
  '-5/16 in');

// Rounding up can cross zero into a clean zero rather than a tiny negative.
check('up from just below zero reaches zero',
  L.formatInches(L.sub(L.rat(0, 1), L.rat(1, 100)),
                 { ft: null, in: { mark: ' in', space: '' }, sep: ' ' }, 16, 'up'),
  '0 in');

// Through applyDelta, the direction applies to the result.
check('applyDelta rounds up',
  (function () {
    var d = L.parse('1/3 in', { allowBareNumber: true });
    return L.applyDelta('a 2 in board', d.inches, 'add', 16, 'up').text;
  })(),
  'a 2 3/8 in board');

check('applyDelta rounds down',
  (function () {
    var d = L.parse('1/3 in', { allowBareNumber: true });
    return L.applyDelta('a 2 in board', d.inches, 'add', 16, 'down').text;
  })(),
  'a 2 5/16 in board');

check('applyDelta defaults to nearest',
  (function () {
    var d = L.parse('1/3 in', { allowBareNumber: true });
    return L.applyDelta('a 2 in board', d.inches, 'add', 16).text;
  })(),
  'a 2 5/16 in board');

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
