/* =====================================================================
   Interface
   ===================================================================== */
(function () {
  'use strict';

  var L = Lengths;
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    text: $('text'), textField: $('text-field'), textReadout: $('text-readout'),
    amount: $('amount'), amountField: $('amount-field'), amountReadout: $('amount-readout'),
    precision: $('precision'), rounding: $('rounding'),
    opAdd: $('op-add'), opSub: $('op-sub'),
    result: $('result'), arith: $('arith'), copy: $('copy'), examples: $('examples'),
    tape: $('tape'), canvas: $('tape-canvas'),
    tapeLabel: $('tape-label'), tapeScale: $('tape-scale')
  };

  var operation = 'add';
  var copyable = '';
  var lastTape = null;

  var DEFAULT_TEXT = 'The rough opening is 7ft 3in.';

  var EXAMPLES = [
    { text: DEFAULT_TEXT,                       amount: '1/2 in',   op: 'add' },
    { text: 'The beam is 5\'-6" long',          amount: '3 1/2 in', op: 'add' },
    { text: 'Cut the 8 ft 0 in stud to fit',    amount: '3 1/4 in', op: 'subtract' },
    { text: 'Order 3 of the 6 ft 2 in posts',   amount: '1 ft',     op: 'add' },
    { text: 'Door rough opening 6 feet 8 inches', amount: '1 1/2',  op: 'subtract' },
    { text: 'Ceiling height 9ft1in and 1/2',    amount: '1/2 in',   op: 'add' }
  ];

  // A neutral rendering, for describing a value rather than echoing notation.
  var PLAIN = { ft: { mark: 'ft', space: ' ' }, in: { mark: 'in', space: ' ' }, sep: ' ' };
  function plain(inches, denom, mode) { return L.formatInches(inches, PLAIN, denom, mode); }

  // Render a value at its own denominator so it is never distorted: a third
  // shows as 1/3, not as the nearest sixteenth. Used for the inputs, which
  // are reports of what was typed rather than results to be rounded.
  function faithful(inches) { return plain(inches, inches.d); }

  function exactAt(inches, denom) { return (inches.n * denom) % inches.d === 0; }

  function round(x, places) {
    var f = Math.pow(10, places);
    return String(Math.round(x * f) / f);
  }

  function quoted(items) {
    return items.map(function (s) { return '“' + s.trim() + '”'; }).join(', ');
  }

  function describe(parsed, what) {
    if (parsed.error === 'multiple') {
      return 'Found ' + parsed.found.length + ' measurements in ' + what +
             ' — it needs exactly one: ' + quoted(parsed.found);
    }
    return 'No measurement found in ' + what + '.';
  }

  function setReadout(node, field, message, bad) {
    node.textContent = message || '';
    node.classList.toggle('is-bad', !!bad);
    field.classList.toggle('is-bad', !!bad);
  }

  function quietResult(message, kind) {
    el.result.textContent = message;
    el.result.className = 'result is-' + kind;
    el.arith.textContent = '';
    el.tape.classList.remove('is-on');
    lastTape = null;
    copyable = '';
    el.copy.disabled = true;
  }

  /* ---------------- the tape segment ----------------
     A zoom into the single inch where the answer lands, subdivided at the
     selected precision. It makes the "Round to" control tangible: pick
     1/64 and the graduations actually get finer. */
  function drawTape() {
    if (!lastTape) return;

    var canvas = el.canvas;
    var css = getComputedStyle(document.documentElement);
    var color = function (name) { return css.getPropertyValue(name).trim(); };

    var dpr = window.devicePixelRatio || 1;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (!width || !height) return;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var pad = 10;
    var span = width - pad * 2;
    var base = height - 16;
    var denom = lastTape.denom;

    // baseline
    ctx.strokeStyle = color('--rule');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, base + 0.5);
    ctx.lineTo(pad + span, base + 0.5);
    ctx.stroke();

    // graduations, tallest at the whole inch and stepping down by halving
    var tallest = base - 6;
    for (var i = 0; i <= denom; i++) {
      var x = Math.round(pad + (span * i) / denom) + 0.5;
      var reduced = denom / gcdInt(i, denom);
      var h;
      if (i === 0 || i === denom) { h = tallest; }
      else if (reduced === 2) { h = tallest * 0.74; }
      else if (reduced === 4) { h = tallest * 0.58; }
      else if (reduced === 8) { h = tallest * 0.45; }
      else if (reduced === 16) { h = tallest * 0.34; }
      else if (reduced === 32) { h = tallest * 0.26; }
      else { h = tallest * 0.2; }

      ctx.strokeStyle = (i === 0 || i === denom) ? color('--ink-faint') : color('--rule');
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base - h);
      ctx.stroke();
    }

    var t = lastTape.rawFracNum / denom;

    // Where the unrounded value fell, when rounding actually moved it. Drawn
    // before the pointer so the pointer stays on top.
    var exact = lastTape.exactOffset;
    if (exact >= 0 && exact <= 1 && Math.abs(exact - t) > 1e-9) {
      var ex = Math.round(pad + span * exact) + 0.5;
      ctx.strokeStyle = color('--ink-faint');
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(ex, base);
      ctx.lineTo(ex, 14);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // the pointer, at the fractional position within this inch
    var px = Math.round(pad + span * t) + 0.5;
    var mark = color('--mark');

    ctx.strokeStyle = mark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, base);
    ctx.lineTo(px, 12);
    ctx.stroke();

    ctx.fillStyle = mark;
    ctx.beginPath();
    ctx.moveTo(px, 12);
    ctx.lineTo(px - 5, 3);
    ctx.lineTo(px + 5, 3);
    ctx.closePath();
    ctx.fill();

    // end labels
    ctx.fillStyle = color('--ink-faint');
    ctx.font = '11px ' + css.getPropertyValue('--mono');
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(String(lastTape.whole) + '"', pad, base + 3);
    ctx.textAlign = 'right';
    ctx.fillText(String(lastTape.whole + 1) + '"', pad + span, base + 3);
  }

  function gcdInt(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1;
  }

  /* ---------------- the worksheet, remembered ----------------
     You rarely measure a wall once. The whole worksheet — sentence, amount,
     direction and both rounding settings — is kept so the page opens where
     you left it. Storage can be missing or refuse to answer (a private
     window, or an embedding that hands the page an opaque origin), so every
     access is guarded; if it fails the page simply opens on its defaults. */

  var STORE_KEY = 'construction-calc.v1';

  var store = (function () {
    try {
      var s = window.localStorage;
      var probe = STORE_KEY + '.probe';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) { return null; }
  })();

  function save() {
    if (!store) return;
    try {
      store.setItem(STORE_KEY, JSON.stringify({
        text: el.text.value,
        amount: el.amount.value,
        operation: operation,
        precision: el.precision.value,
        rounding: el.rounding.value
      }));
    } catch (e) { /* full or revoked mid-session; not worth interrupting for */ }
  }

  // Only adopt a stored choice the control actually offers, so an old or
  // hand-edited entry cannot leave a select showing nothing.
  function restoreSelect(node, value) {
    for (var i = 0; i < node.options.length; i++) {
      if (node.options[i].value === value) { node.value = value; return; }
    }
  }

  function restore() {
    if (!store) return;
    var saved;
    try { saved = JSON.parse(store.getItem(STORE_KEY)); } catch (e) { return; }
    if (!saved || typeof saved !== 'object') return;

    if (typeof saved.text === 'string') el.text.value = saved.text;
    if (typeof saved.amount === 'string') el.amount.value = saved.amount;
    restoreSelect(el.precision, saved.precision);
    restoreSelect(el.rounding, saved.rounding);
    if (saved.operation === 'add' || saved.operation === 'subtract') {
      applyOperation(saved.operation);
    }
  }

  /* ---------------- main ---------------- */

  function update() {
    var text = el.text.value;
    var amountText = el.amount.value;
    var denom = parseInt(el.precision.value, 10);
    // The direction applies to the answer. The two readouts below stay on
    // nearest, so they keep showing faithfully what was typed.
    var mode = el.rounding.value;

    save();

    el.copy.textContent = 'Copy';
    el.copy.classList.remove('is-done');

    var amount = null;
    if (amountText.trim() === '') {
      setReadout(el.amountReadout, el.amountField, '', false);
    } else {
      var a = L.parse(amountText, { allowBareNumber: true });
      if (!a.ok) {
        setReadout(el.amountReadout, el.amountField, describe(a, 'the amount'), true);
      } else {
        amount = a.inches;
        setReadout(el.amountReadout, el.amountField,
          '= ' + faithful(amount) + (a.bare ? '   (plain number read as inches)' : ''), false);
      }
    }

    var source = null;
    if (text.trim() === '') {
      setReadout(el.textReadout, el.textField, '', false);
    } else {
      var s = L.parse(text, { allowBareNumber: false });
      if (!s.ok) {
        setReadout(el.textReadout, el.textField, describe(s, 'the text'), true);
      } else {
        source = s.inches;
        setReadout(el.textReadout, el.textField,
          'Found “' + s.measurement.text.trim() + '” = ' + faithful(source), false);
      }
    }

    if (text.trim() === '' || amountText.trim() === '') {
      quietResult('Fill in both boxes to see the result.', 'quiet');
      return;
    }
    if (source === null || amount === null) {
      quietResult('Fix the flagged box above.', 'bad');
      return;
    }

    var applied = L.applyDelta(text, amount, operation, denom, mode);
    if (!applied.ok) { quietResult(describe(applied, 'the text'), 'bad'); return; }

    render(applied, amount, denom, mode);
  }

  function render(applied, amount, denom, mode) {
    el.result.className = 'result';
    el.result.textContent = '';

    var hit = document.createElement('span');
    hit.className = 'hit';
    hit.textContent = applied.replacement;

    el.result.appendChild(document.createTextNode(applied.text.slice(0, applied.start)));
    el.result.appendChild(hit);
    el.result.appendChild(document.createTextNode(applied.text.slice(applied.end)));

    var total = L.toNumber(applied.after);

    el.arith.textContent = '';
    var equation = document.createElement('span');
    equation.className = 'equation';
    // The operands are exact; only the answer is snapped to a graduation, so
    // only the answer is marked approximate.
    equation.textContent =
      faithful(applied.before) + (operation === 'subtract' ? ' − ' : ' + ') +
      faithful(amount) + ' = ' +
      (exactAt(applied.after, denom) ? '' : '≈ ') + plain(applied.after, denom, mode);

    var conversions = document.createElement('span');
    conversions.className = 'conversions';
    conversions.textContent =
      round(total, 4) + ' in · ' + round(total / 12, 4) + ' ft · ' +
      round(total * 0.0254, 4) + ' m';

    el.arith.appendChild(equation);
    if (applied.negative) {
      var warn = document.createElement('span');
      warn.className = 'warn';
      warn.textContent = 'below zero';
      el.arith.appendChild(warn);
    }
    el.arith.appendChild(conversions);

    // The tape shows the inch the answer lands in — only meaningful for a
    // value at or above zero.
    var d = L.decompose(applied.after, PLAIN, denom, mode);
    if (!applied.negative) {
      lastTape = d;
      el.tape.classList.add('is-on');
      el.tapeLabel.textContent = plain(applied.after, denom, mode);
      el.tapeScale.textContent = 'graduated in 1/' + denom + '"' +
        (mode === 'nearest' ? '' : ' · rounded ' + mode);
      drawTape();
    } else {
      lastTape = null;
      el.tape.classList.remove('is-on');
    }

    copyable = applied.text;
    el.copy.disabled = false;
  }

  /* ---------------- events ---------------- */

  function applyOperation(next) {
    operation = next;
    var isAdd = next === 'add';
    el.opAdd.setAttribute('aria-pressed', String(isAdd));
    el.opSub.setAttribute('aria-pressed', String(!isAdd));
  }

  function setOperation(next) {
    applyOperation(next);
    update();
  }

  function copyResult() {
    if (!copyable) return;
    var done = function () {
      el.copy.textContent = 'Copied';
      el.copy.classList.add('is-done');
    };
    var fallback = function () {
      var scratch = document.createElement('textarea');
      scratch.value = copyable;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* nothing to do */ }
      document.body.removeChild(scratch);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(copyable).then(done, fallback);
    } else { fallback(); }
  }

  EXAMPLES.forEach(function (ex) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';

    var op = document.createElement('span');
    op.className = 'chip-op';
    op.textContent = (ex.op === 'subtract' ? '− ' : '+ ') + ex.amount;

    var body = document.createElement('span');
    body.className = 'chip-text';
    body.textContent = ex.text;

    b.appendChild(op);
    b.appendChild(body);
    b.addEventListener('click', function () {
      el.text.value = ex.text;
      el.amount.value = ex.amount;
      setOperation(ex.op);
    });
    el.examples.appendChild(b);
  });

  el.text.addEventListener('input', update);
  el.amount.addEventListener('input', update);
  el.precision.addEventListener('change', update);
  el.rounding.addEventListener('change', update);
  el.opAdd.addEventListener('click', function () { setOperation('add'); });
  el.opSub.addEventListener('click', function () { setOperation('subtract'); });
  el.copy.addEventListener('click', copyResult);

  window.addEventListener('resize', drawTape);

  // The tape is painted with colors read from CSS, so it has to be redrawn
  // whenever the viewer's theme changes — by OS preference or by the host
  // stamping data-theme on the root element.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', drawTape);
    else if (mq.addListener) mq.addListener(drawTape);
  }
  new MutationObserver(drawTape).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme']
  });

  restore();
  update();
})();
