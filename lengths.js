/*
 * lengths.js - parse, add and subtract feet/inch/fraction measurements
 * found inside free-form text.
 *
 * Works both as a plain browser script (window.Lengths) and in Node
 * (require('./lengths.js')), so the same file backs the page and the tests.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Lengths = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Exact rational arithmetic.
   *
   * Measurements are kept as exact fractions of an inch so that repeated
   * edits never accumulate binary floating point error: 1/3 + 1/3 + 1/3
   * is exactly 1, not 0.9999999999999998.
   * ------------------------------------------------------------------ */

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      var t = a % b;
      a = b;
      b = t;
    }
    return a;
  }

  function rat(n, d) {
    if (d === 0) throw new Error('zero denominator');
    if (d < 0) {
      n = -n;
      d = -d;
    }
    var g = gcd(n, d) || 1;
    return { n: n / g, d: d / g };
  }

  function add(a, b) { return rat(a.n * b.d + b.n * a.d, a.d * b.d); }
  function sub(a, b) { return rat(a.n * b.d - b.n * a.d, a.d * b.d); }
  function scale(a, k) { return rat(a.n * k, a.d); }
  function toNumber(a) { return a.n / a.d; }
  function isZero(a) { return a.n === 0; }

  var ZERO = { n: 0, d: 1 };

  /* ------------------------------------------------------------------ *
   * Lexing
   * ------------------------------------------------------------------ */

  // A number is a mixed number ("3 1/2"), a bare fraction ("1/2"),
  // a decimal ("3.5", ".5") or an integer ("3"). Order matters: the
  // longest forms have to be tried first.
  var NUM =
    '(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d*\\.\\d+|\\d+)';

  // Word units must not run into a longer word ("6 int" is not 6 inches), but
  // a digit may follow: "6ft3in" is written without spaces all the time.
  // The trailing period of "ft." is deliberately NOT consumed so that a
  // sentence-ending period survives outside the measurement.
  var UNIT =
    "(?:(?:feet|foot|ft|inches|inch|in)(?![a-z])|''|[\"'‘’“”′″])";

  // The space and the unit are optional *together*: an unattached number
  // must not consume the whitespace that follows it, or replacing the
  // measurement would eat the gap before the next word.
  var TOKEN_RE = new RegExp('(' + NUM + ')(?:(\\s*)(' + UNIT + '))?', 'gi');

  // Text allowed to sit between two parts of a single measurement:
  // "6ft 3in", "6', 3\"", "6 ft. 3 in", "6 ft and 1/2", "5'-6\"".
  var CONNECTOR_RE = /^[\s,.]*(?:and|&|plus|\+|[-–])?[\s,.]*$/i;

  var FULL_NUM_RE = new RegExp('^' + NUM + '$');

  function unitKind(text) {
    if (!text) return null;
    var s = text.toLowerCase();
    if (s === 'ft' || s === 'feet' || s === 'foot' ||
        s === "'" || s === '‘' || s === '’' || s === '′') {
      return 'ft';
    }
    return 'in';
  }

  function numberToRat(text) {
    var t = text.trim().replace(/\s*\/\s*/g, '/');
    var m;
    if ((m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t))) {
      return add(rat(+m[1], 1), rat(+m[2], +m[3]));
    }
    if ((m = /^(\d+)\/(\d+)$/.exec(t))) {
      return rat(+m[1], +m[2]);
    }
    if ((m = /^(\d*)\.(\d+)$/.exec(t))) {
      var den = Math.pow(10, m[2].length);
      var whole = m[1] === '' ? 0 : +m[1];
      return rat(whole * den + +m[2], den);
    }
    return rat(+t, 1);
  }

  function isFractionText(text) {
    return text.indexOf('/') !== -1;
  }

  function tokenize(text) {
    var tokens = [];
    var m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(text)) !== null) {
      // A zero-width match would spin forever; the number pattern always
      // consumes at least one character, but stay defensive.
      if (m[0].length === 0) {
        TOKEN_RE.lastIndex++;
        continue;
      }
      var value;
      try {
        value = numberToRat(m[1]);
      } catch (e) {
        continue; // e.g. "1/0"
      }
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        numText: m[1],
        space: m[2] || '',
        unitText: m[3] || '',
        unit: unitKind(m[3]),
        fraction: isFractionText(m[1]),
        value: value
      });
    }
    return tokens;
  }

  /* ------------------------------------------------------------------ *
   * Grouping tokens into measurements
   * ------------------------------------------------------------------ */

  function startGroup(token) {
    var g = {
      start: token.start,
      end: token.end,
      parts: { ft: null, in: null },
      lastUnit: token.unit,
      style: { ft: null, in: null, sep: null, tail: null },
      tokens: [token]
    };
    g.parts[token.unit] = token.value;
    g.style[token.unit] = { mark: token.unitText, space: token.space };
    return g;
  }

  // How `token` joins `group`, or null when it starts a new measurement.
  function extendMode(group, token, gap) {
    if (!CONNECTOR_RE.test(gap)) return null;
    if (token.unit === 'ft') {
      // A second feet value means a second measurement.
      return null;
    }
    if (token.unit === 'in') {
      return group.parts.in === null ? 'unit' : null;
    }
    // Unitless: a bare fraction folds into the part before it...
    if (token.fraction && toNumber(token.value) < 1 && group.lastUnit !== null) {
      return 'fraction';
    }
    // ...and a number glued straight onto a feet marker is inches: 5'6, 6ft2.
    // The zero-length gap is what makes this safe — with any space at all the
    // number is left alone, so prose like "the 6 ft 2 boards" is untouched.
    if (gap === '' && group.lastUnit === 'ft' && group.parts.in === null) {
      return 'inches';
    }
    return null;
  }

  function extend(group, token, gap, mode) {
    if (mode === 'unit') {
      group.parts[token.unit] = token.value;
      group.style[token.unit] = { mark: token.unitText, space: token.space };
      if (group.style.sep === null) group.style.sep = gap;
      group.lastUnit = token.unit;
    } else if (mode === 'inches') {
      // No inch marker was written, so the notation for it is derived from
      // the feet marker when the result is formatted.
      group.parts.in = token.value;
      if (group.style.sep === null) group.style.sep = gap;
      group.lastUnit = 'in';
    } else {
      // A fraction written apart from its unit ("3in and 1/2"). Remember the
      // wording so the answer can be put back the same shape instead of
      // collapsing into "3 1/2in".
      if (group.style.tail === null) {
        group.style.tail = { sep: gap, on: group.lastUnit };
      }
      group.parts[group.lastUnit] = add(group.parts[group.lastUnit], token.value);
    }
    group.end = token.end;
    group.tokens.push(token);
  }

  function findMeasurements(text) {
    var tokens = tokenize(text);
    var groups = [];
    var cur = null;

    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (cur) {
        var gap = text.slice(cur.end, t.start);
        var mode = extendMode(cur, t, gap);
        if (mode) {
          extend(cur, t, gap, mode);
          continue;
        }
        groups.push(cur);
        cur = null;
      }
      // Only a token carrying an explicit unit may open a measurement.
      if (t.unit) cur = startGroup(t);
    }
    if (cur) groups.push(cur);

    groups.forEach(function (g) {
      g.text = text.slice(g.start, g.end);
      g.inches = totalInches(g);
    });
    return groups;
  }

  function totalInches(group) {
    var total = ZERO;
    if (group.parts.ft) total = add(total, scale(group.parts.ft, 12));
    if (group.parts.in) total = add(total, group.parts.in);
    return total;
  }

  /* ------------------------------------------------------------------ *
   * Formatting
   * ------------------------------------------------------------------ */

  var FT_TO_IN_MARK = { "'": '"', '‘': '“', '’': '”', '′': '″' };
  var IN_TO_FT_MARK = { '"': "'", '“': '‘', '”': '’', '″': '′' };

  function matchCase(sample, word) {
    return /[A-Z]/.test(sample) ? word.toUpperCase() : word;
  }

  // Derive the inch marker to use when the source measurement had feet only.
  function deriveInchStyle(ftStyle) {
    if (!ftStyle) return { mark: 'in', space: ' ' };
    var mark = FT_TO_IN_MARK[ftStyle.mark];
    if (mark) return { mark: mark, space: ftStyle.space };
    return { mark: matchCase(ftStyle.mark, 'in'), space: ftStyle.space || ' ' };
  }

  // ...and the feet marker when the source had inches only.
  function deriveFootStyle(inStyle) {
    if (!inStyle) return { mark: 'ft', space: ' ' };
    var mark = IN_TO_FT_MARK[inStyle.mark];
    if (mark) return { mark: mark, space: inStyle.space };
    return { mark: matchCase(inStyle.mark, 'ft'), space: inStyle.space || ' ' };
  }

  function renderPart(whole, fracNum, fracDen, style) {
    var num = String(whole);
    if (fracNum > 0) {
      num = whole === 0 ? fracNum + '/' + fracDen
                        : whole + ' ' + fracNum + '/' + fracDen;
    }
    return num + style.space + style.mark;
  }

  /**
   * Split an exact inch value into the pieces a reader sees, snapped to the
   * nearest 1/denom of an inch. Kept separate from formatInches because the
   * tape drawing needs the numbers, not the string.
   */
  /**
   * Snap an exact value to a whole number of 1/denom inches.
   *
   * mode - 'nearest' (default), 'up' or 'down'. Up and down are signed: up
   *        moves toward a longer measurement and down toward a shorter one,
   *        which is what a person means by rounding a length up or down.
   *
   * Kept in integer arithmetic on purpose. Dividing first would put a value
   * that should land exactly on a graduation at 7.999999999, and 'down'
   * would then drop it a whole tick.
   */
  function snap(inches, denom, mode) {
    var num = inches.n * denom;
    var den = inches.d;
    var q = Math.trunc(num / den);
    var r = num - q * den;               // same sign as num, zero when exact

    if (r === 0) return q;
    if (mode === 'up') return num > 0 ? q + 1 : q;
    if (mode === 'down') return num > 0 ? q : q - 1;
    // nearest, halves away from zero
    return Math.abs(r) * 2 >= den ? q + (num > 0 ? 1 : -1) : q;
  }

  function decompose(inches, style, denom, mode) {
    denom = denom || 16;
    style = style || { ft: null, in: null, sep: null };

    var signed = snap(inches, denom, mode);
    var negative = signed < 0;
    var ticks = Math.abs(signed);
    var perFoot = 12 * denom;

    var showFeet = style.ft !== null && ticks >= perFoot;
    var feet = showFeet ? Math.floor(ticks / perFoot) : 0;
    var inchTicks = ticks - feet * perFoot;
    var whole = Math.floor(inchTicks / denom);
    var remainder = inchTicks - whole * denom;
    var g = gcd(remainder, denom) || 1;

    return {
      negative: negative, ticks: ticks, showFeet: showFeet, feet: feet,
      whole: whole, fracNum: remainder / g, fracDen: denom / g,
      rawFracNum: remainder, denom: denom, mode: mode || 'nearest',
      // Where the unrounded value sits within the inch on display, so the
      // tape can show what the rounding moved.
      exactOffset: Math.abs(toNumber(inches)) - (feet * 12 + whole)
    };
  }

  /**
   * Render an exact inch value using the notation of the source measurement.
   *
   * style  - the `style` object of the parsed group (marks and spacing to echo)
   * denom  - fraction resolution, e.g. 16 for 1/16"
   */
  function formatInches(inches, style, denom, mode) {
    style = style || { ft: null, in: null, sep: null };
    var d = decompose(inches, style, denom, mode);

    var ftStyle = style.ft || deriveFootStyle(style.in);
    var inStyle = style.in || deriveInchStyle(style.ft);

    // With no separator to echo, symbol notation joins tight (8'3") while
    // word notation needs a space (8 ft 3 in).
    var sep = style.sep;
    if (sep === null || sep === undefined) {
      sep = /[a-z]/i.test(ftStyle.mark) ? ' ' : '';
    }

    var pieces = [];
    if (d.showFeet) pieces.push(renderPart(d.feet, 0, 1, ftStyle));
    if (d.whole > 0 || d.fracNum > 0 || pieces.length === 0) {
      // When the source wrote its fraction apart from the inches, echo that
      // shape back: "3in and 1/2" stays "3in and 3/4", not "3 3/4in". Only
      // for a fraction hung off the inches; a fraction of a foot has no
      // clean equivalent once the answer has moved.
      var tail = style.tail;
      if (tail && tail.on === 'in' && d.fracNum > 0) {
        pieces.push(renderPart(d.whole, 0, 1, inStyle) +
                    tail.sep + d.fracNum + '/' + d.fracDen);
      } else {
        pieces.push(renderPart(d.whole, d.fracNum, d.fracDen, inStyle));
      }
    }

    return (d.negative && d.ticks !== 0 ? '-' : '') + pieces.join(sep);
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  /**
   * Find the single measurement in `text`.
   *
   * options.allowBareNumber - when the text holds no unit at all but is
   *   nothing more than a number, read it as inches. Used for the "amount
   *   to add" field, where "3 1/2" unambiguously means inches.
   */
  function parse(text, options) {
    options = options || {};
    var groups = findMeasurements(text || '');

    if (groups.length > 1) {
      return {
        ok: false,
        error: 'multiple',
        found: groups.map(function (g) { return g.text; })
      };
    }
    if (groups.length === 1) {
      return { ok: true, measurement: groups[0], inches: groups[0].inches };
    }

    if (options.allowBareNumber) {
      var t = (text || '').trim();
      if (FULL_NUM_RE.test(t)) {
        var value = numberToRat(t);
        return { ok: true, inches: value, assumedUnit: 'in', bare: true };
      }
    }
    return { ok: false, error: 'none', found: [] };
  }

  /**
   * Add or subtract `deltaInches` from the one measurement inside `text`,
   * leaving every other character of `text` untouched.
   */
  function applyDelta(text, deltaInches, operation, denom, mode) {
    var parsed = parse(text, { allowBareNumber: false });
    if (!parsed.ok) return parsed;

    var g = parsed.measurement;
    var result = operation === 'subtract'
      ? sub(g.inches, deltaInches)
      : add(g.inches, deltaInches);

    var replacement = formatInches(result, g.style, denom, mode);

    return {
      ok: true,
      text: text.slice(0, g.start) + replacement + text.slice(g.end),
      replacement: replacement,
      original: g.text,
      start: g.start,
      end: g.start + replacement.length,
      before: g.inches,
      after: result,
      negative: result.n < 0
    };
  }

  return {
    rat: rat,
    add: add,
    sub: sub,
    scale: scale,
    toNumber: toNumber,
    isZero: isZero,
    numberToRat: numberToRat,
    tokenize: tokenize,
    findMeasurements: findMeasurements,
    formatInches: formatInches,
    decompose: decompose,
    parse: parse,
    applyDelta: applyDelta
  };
});
