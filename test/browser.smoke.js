/* Browser test: page behavior, engine parity and both themes.
   Run: NODE_PATH=/path/to/global/node_modules node test/browser.smoke.js */
'use strict';
var path = require('path');
var { chromium } = require('playwright');

var FILE = 'file://' + path.resolve(__dirname, '..', 'index.html');
var DIR = path.resolve(__dirname, '..');
var DEFAULT_TEXT = 'The rough opening is 7ft 3in.';
var STORE_KEY = 'construction-calc.v1';

(async function () {
  var browser = await chromium.launch();
  var failures = [];
  var errors = [];

  function check(name, actual, expected) {
    if (actual !== expected) {
      failures.push(name + '\n    expected: ' + JSON.stringify(expected) +
                    '\n    actual:   ' + JSON.stringify(actual));
    }
  }

  for (var theme of ['light', 'dark']) {
    var page = await browser.newPage({
      viewport: { width: 760, height: 1400 },
      colorScheme: theme
    });
    page.on('console', m => { if (m.type() === 'error') errors.push(theme + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(theme + ': ' + String(e)));
    await page.goto(FILE);

    // --- engine parity: the same expectations the standalone suite asserts ---
    if (theme === 'light') {
      var engine = await page.evaluate(function () {
        var L = window.Lengths;
        function ap(text, delta, op, denom) {
          var d = L.parse(delta, { allowBareNumber: true });
          if (!d.ok) return 'delta:' + d.error;
          var r = L.applyDelta(text, d.inches, op || 'add', denom || 16);
          return r.ok ? r.text : r.error;
        }
        function val(text) {
          var p = L.parse(text, { allowBareNumber: true });
          return p.ok ? L.toNumber(p.inches) : p.error;
        }
        return {
          prose: ap('I am 6ft, 3in and 1/2 tall', '1/2 in'),
          scattered: ap('I am 6ft, 3in and 10/32 tall', '7/16 in'),
          scatteredCarry: ap('6ft, 3in and 3/4', '1/2 in'),
          scatteredGone: ap('I am 6ft, 3in and 1/2 tall', '1/2 in'),
          inlineMixed: ap('6ft, 3 1/2in', '1/4 in'),
          symbol: ap('The beam is 5\'-6" long', '3 1/2 in'),
          subtract: ap('cut the 8 ft 0 in stud', '3 1/4 in', 'subtract'),
          carry: ap('6 ft 11 in', '2 in'),
          inchesOnly: ap('a 10 in board', '5 in'),
          growsInches: ap("an 8' board", '3 in'),
          dropsZeroFeet: ap('0 ft 2 in', '3 in'),
          words: ap('6 feet 3 inches', '1 inch'),
          periods: ap('6 ft. 3 in. board', '1 in'),
          negative: ap('a 2 in gap', '5 in', 'subtract'),
          coarse: ap('1 in', '1/8 in', 'add', 4),
          fine: ap('1 in', '1/32 in', 'add', 32),
          bareAmount: ap('a 6 ft 1 in post', '2 1/2'),
          glued: val('I am 6ft3in and 1/2 tall'),
          gluedTwoDigit: val('The room is 12ft6in wide'),
          gluedBare: val("5'6"),
          gluedBareWord: val('6ft2'),
          gluedApply: ap('I am 6ft3in and 1/2 tall', '1/2 in'),
          gluedBareApply: ap("a 5'6 opening", '2 in'),
          spacedNotInches: val('the 6 ft 2 boards'),
          intNotInches: val('I need 6 int the corner'),
          footingNotFeet: val('pour 6 footings today'),
          proseNumber: val('Order 3 of the 6 ft 2 in posts'),
          unrelatedFraction: val('The 6 ft board costs 1/2 the price'),
          multiple: val('an 8 ft wall and a 3 ft door'),
          none: val('nothing here'),
          bareInProse: val('I have 3 boards')
        };
      });

      check('prose preserved', engine.prose, 'I am 6ft, 4in tall');
      check('scattered fraction keeps its shape', engine.scattered,
            'I am 6ft, 3in and 3/4 tall');
      check('scattered fraction carries', engine.scatteredCarry, '6ft, 4in and 1/4');
      check('scattered clause drops on a whole inch', engine.scatteredGone,
            'I am 6ft, 4in tall');
      check('inline mixed number stays inline', engine.inlineMixed, '6ft, 3 3/4in');
      check('symbol notation echoed', engine.symbol, 'The beam is 5\'-9 1/2" long');
      check('subtract', engine.subtract, 'cut the 7 ft 8 3/4 in stud');
      check('carry into feet', engine.carry, '7 ft 1 in');
      check('inches-only stays inches-only', engine.inchesOnly, 'a 15 in board');
      check('feet-only grows inches', engine.growsInches, 'an 8\'3" board');
      check('drops zero feet', engine.dropsZeroFeet, '5 in');
      check('word units echoed', engine.words, '6 feet 4 inches');
      check('separator echoed', engine.periods, '6 ft. 4 in. board');
      check('negative', engine.negative, 'a -3 in gap');
      check('coarse rounding', engine.coarse, '1 1/4 in');
      check('fine rounding', engine.fine, '1 1/32 in');
      check('bare amount is inches', engine.bareAmount, 'a 6 ft 3 1/2 in post');
      check('glued units', engine.glued, 75.5);
      check('glued two-digit', engine.gluedTwoDigit, 150);
      check('bare inches glued to symbol', engine.gluedBare, 66);
      check('bare inches glued to word unit', engine.gluedBareWord, 74);
      check('add to glued input', engine.gluedApply, 'I am 6ft4in tall');
      check('bare glued gains marker', engine.gluedBareApply, 'a 5\'8" opening');
      check('spaced number is not inches', engine.spacedNotInches, 72);
      check('"int" is not inches', engine.intNotInches, 'none');
      check('"footing" is not feet', engine.footingNotFeet, 'none');
      check('prose number ignored', engine.proseNumber, 74);
      check('unrelated fraction ignored', engine.unrelatedFraction, 72);
      check('two measurements rejected', engine.multiple, 'multiple');
      check('no measurement', engine.none, 'none');
      check('bare number in prose is not a measurement', engine.bareInProse, 'none');

      // --- UI behavior ---
      check('default text', await page.inputValue('#text'), DEFAULT_TEXT);
      check('default result', await page.locator('#result').textContent(),
            'The rough opening is 7ft 3 1/2in.');
      check('tape visible', await page.locator('#tape').isVisible(), true);
      check('tape scale label', await page.locator('#tape-scale').textContent(),
            'graduated in 1/16"');

      // canvas actually painted something
      var painted = await page.evaluate(function () {
        var c = document.getElementById('tape-canvas');
        var ctx = c.getContext('2d');
        var d = ctx.getImageData(0, 0, c.width, c.height).data;
        for (var i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
        return false;
      });
      check('tape canvas painted', painted, true);

      // precision drives the tape
      await page.selectOption('#precision', '64');
      check('tape follows precision', await page.locator('#tape-scale').textContent(),
            'graduated in 1/64"');
      await page.selectOption('#precision', '16');

      // rounding direction
      check('defaults to nearest', await page.inputValue('#rounding'), 'nearest');
      await page.fill('#text', 'a 2 in board');
      await page.fill('#amount', '1/3 in');
      check('nearest result', await page.locator('#result').textContent(),
            'a 2 5/16 in board');
      await page.selectOption('#rounding', 'up');
      check('up result', await page.locator('#result').textContent(),
            'a 2 3/8 in board');
      check('caption names the direction', await page.locator('#tape-scale').textContent(),
            'graduated in 1/16" · rounded up');
      await page.selectOption('#rounding', 'down');
      check('down result', await page.locator('#result').textContent(),
            'a 2 5/16 in board');

      // The equation must reconcile: the amount is 1/3, not a distorted 5/16,
      // and the answer is flagged approximate because rounding moved it.
      check('equation shows operands exactly',
            await page.locator('.arith .equation').textContent(),
            '2 in + 1/3 in = ≈ 2 5/16 in');
      check('amount readout is undistorted',
            await page.locator('#amount-readout').textContent(), '= 1/3 in');

      // a value already on a graduation must not move in any direction
      await page.fill('#amount', '1/4 in');
      var onTick = [];
      for (var m of ['nearest', 'up', 'down']) {
        await page.selectOption('#rounding', m);
        onTick.push(await page.locator('#result').textContent());
      }
      check('exact value unmoved by direction', onTick.join('|'),
            'a 2 1/4 in board|a 2 1/4 in board|a 2 1/4 in board');
      await page.selectOption('#rounding', 'nearest');
      check('caption drops direction on nearest',
            await page.locator('#tape-scale').textContent(), 'graduated in 1/16"');

      // error path
      await page.fill('#text', 'an 8 ft wall and a 3 ft door');
      var note = await page.locator('#text-readout').textContent();
      check('names both measurements', /“8 ft”, “3 ft”/.test(note), true);
      check('tape hidden on error', await page.locator('#tape').isVisible(), false);
      check('copy disabled on error', await page.locator('#copy').isDisabled(), true);
      await page.locator('.chip').nth(0).click();

      // --- aggregating into feet ---
      var feetState = function () {
        return page.locator('#feet').getAttribute('aria-pressed');
      };

      check('the default sentence arms the toggle', await feetState(), 'true');

      await page.fill('#text', '69.1203498in');
      check('an inches-only answer gains feet', await page.locator('#result').textContent(),
            '5ft 9 5/8in');
      await page.click('#feet');
      check('toggling off keeps the answer in inches',
            await page.locator('#result').textContent(), '69 5/8in');
      check('the toggle reports its state', await feetState(), 'false');
      check('the readout follows the same convention',
            /\bft\b/.test(await page.locator('#text-readout').textContent()), false);

      // Text that uses feet arms the toggle on the way in...
      await page.fill('#text', 'The rough opening is 7ft 3in.');
      check('feet in the text arm the toggle', await feetState(), 'true');

      // ...and turning it back off holds while the editing continues.
      await page.click('#feet');
      check('a deliberate off collapses feet into inches',
            await page.locator('#result').textContent(), 'The rough opening is 87 1/2in.');
      await page.fill('#text', 'The rough opening is 7ft 4in.');
      check('editing feet text does not re-arm it', await feetState(), 'false');
      await page.fill('#text', 'a 7ft door and a 3ft window');
      await page.fill('#text', 'The rough opening is 7ft 5in.');
      check('an unreadable draft in between does not re-arm it', await feetState(), 'false');

      // Feet only appear once there are twelve inches to show.
      await page.fill('#text', 'a 10in offcut');
      await page.click('#feet');
      check('under a foot stays in inches with feet on',
            await page.locator('#result').textContent(), 'a 10 1/2in offcut');
      await page.locator('.chip').nth(0).click();

      // --- the worksheet survives a reload ---
      await page.fill('#text', 'Header sits 7 ft 3 in above the slab');
      await page.fill('#amount', '2 1/4 in');
      await page.click('#op-sub');
      await page.selectOption('#precision', '8');
      await page.selectOption('#rounding', 'up');
      await page.click('#feet');
      var beforeFeet = await feetState();
      var before = await page.locator('#result').textContent();
      await page.reload();
      check('feet setting remembered', await feetState(), beforeFeet);
      check('text remembered', await page.inputValue('#text'),
            'Header sits 7 ft 3 in above the slab');
      check('amount remembered', await page.inputValue('#amount'), '2 1/4 in');
      check('direction remembered',
            await page.locator('#op-sub').getAttribute('aria-pressed'), 'true');
      check('precision remembered', await page.inputValue('#precision'), '8');
      check('rounding remembered', await page.inputValue('#rounding'), 'up');
      check('result recomputed from the remembered worksheet',
            await page.locator('#result').textContent(), before);

      // An emptied box is a state worth keeping too — it must not spring back
      // to the default sentence on the next visit.
      await page.fill('#text', '');
      await page.reload();
      check('emptied text stays empty', await page.inputValue('#text'), '');

      // Junk in storage must not take the page down with it.
      await page.evaluate(function (k) {
        localStorage.setItem(k, '{ not json');
      }, STORE_KEY);
      await page.reload();
      check('survives unparseable storage', await page.inputValue('#text'), DEFAULT_TEXT);

      await page.evaluate(function (k) {
        localStorage.setItem(k, JSON.stringify({
          text: 'a 2 ft board', amount: '1 in',
          precision: '999', rounding: 'sideways', operation: 'multiply'
        }));
      }, STORE_KEY);
      await page.reload();
      check('ignores an out-of-range precision', await page.inputValue('#precision'), '16');
      check('ignores an unknown rounding', await page.inputValue('#rounding'), 'nearest');
      check('ignores an unknown operation',
            await page.locator('#op-add').getAttribute('aria-pressed'), 'true');
      check('still restores the valid fields', await page.inputValue('#text'), 'a 2 ft board');

      // Leave a pristine page behind for the screenshot.
      await page.evaluate(function (k) { localStorage.removeItem(k); }, STORE_KEY);
      await page.reload();
      check('clean slate returns the default', await page.inputValue('#text'), DEFAULT_TEXT);
    }

    // --- theme integrity: body must paint its own ground, text must contrast ---
    var colors = await page.evaluate(function () {
      var body = getComputedStyle(document.body);
      var res = getComputedStyle(document.getElementById('result'));
      return { bg: body.backgroundColor, fg: body.color, resultFg: res.color };
    });
    check(theme + ': body has explicit background',
          colors.bg !== 'rgba(0, 0, 0, 0)' && colors.bg !== 'transparent', true);

    function lum(rgb) {
      var m = rgb.match(/\d+/g).map(Number);
      return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    }
    var contrast = Math.abs(lum(colors.bg) - lum(colors.fg));
    check(theme + ': text contrasts with ground', contrast > 0.4, true);
    check(theme + ': ground matches theme',
          theme === 'dark' ? lum(colors.bg) < 0.3 : lum(colors.bg) > 0.7, true);

    await page.screenshot({ path: path.join(DIR, theme === 'light' ? 'screenshot.png' : 'screenshot-dark.png'), fullPage: true });
    await page.close();
  }

  await browser.close();

  if (errors.length) failures.push('console errors:\n    ' + errors.join('\n    '));
  console.log(failures.length ? 'FAILED (' + failures.length + ')' : 'all checks passed');
  failures.forEach(f => console.log('\n  FAIL ' + f));
  process.exit(failures.length ? 1 : 0);
})();
