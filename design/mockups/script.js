/* SmartHomeCenter mockup behaviour. Vanilla JS; only data moves. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fmt = function (n, d) { return Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  function flash(el) {
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
  function setText(el, txt) {
    if (!el || el.textContent === txt) return;
    el.textContent = txt;
    flash(el);
  }
  var toastEl;
  function toast(msg, isError) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', !!isError);
    toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
  }

  /* ---- seeded random (mulberry32, seed 4711) ---- */
  var seed = 4711;
  function rnd() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /* ---- simulated clock and live figures ---- */
  var minutes = 7 * 60 + 42, speed = 60, paused = false, tickN = 0;
  var clockEl = $('[data-clock]');
  var live = {
    net: 2.84, solar: 0.42, heat: 64, temp: 21.4
  };
  function tick() {
    if (paused) return schedule();
    minutes += 1; tickN++;
    if (clockEl) setText(clockEl, pad2(Math.floor(minutes / 60) % 24) + ':' + pad2(minutes % 60));
    var net = $('[data-net]');
    if (net) {
      live.net = Math.round((live.net + (rnd() - 0.5) * 0.06) * 100) / 100;
      live.net = Math.min(3.1, Math.max(2.6, live.net));
      live.solar = Math.round((live.solar + (rnd() - 0.45) * 0.03) * 100) / 100;
      live.solar = Math.min(0.6, Math.max(0.3, live.solar));
      var haus = Math.round((live.net + live.solar) * 100) / 100;
      setText(net, fmt(live.net, 2));
      setText($('[data-solar]'), fmt(live.solar, 2) + ' kW');
      setText($('[data-haus]'), fmt(haus, 2) + ' kW');
      var g = $('[data-bar-grid]'), s = $('[data-bar-solar]');
      if (g) g.style.transform = 'scaleX(' + (live.net / 3.5).toFixed(3) + ')';
      if (s) s.style.transform = 'scaleX(' + (live.solar / 3.5).toFixed(3) + ')';
      if (tickN % 2 === 0) {
        live.heat = Math.min(70, Math.max(58, live.heat + Math.round((rnd() - 0.5) * 6)));
        var hb = $('[data-wz-heat]');
        if (hb) hb.style.transform = 'scaleX(' + (live.heat / 100) + ')';
        setText($('[data-wz-heat-chip]'), 'Heizt ' + live.heat + ' %');
      }
      if (tickN % 3 === 0) {
        live.temp = Math.round((live.temp + (rnd() - 0.4) * 0.2) * 10) / 10;
        live.temp = Math.min(21.7, Math.max(21.1, live.temp));
        var te = $('[data-wz-temp]');
        if (te) setText(te, fmt(live.temp, 1));
      }
    }
    schedule();
  }
  var timer;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, Math.min(60000, Math.max(1000, 60000 / speed)));
  }
  timer = setTimeout(tick, 8000);

  /* speed chips + pause */
  $$('[data-speed]').forEach(function (b) {
    b.addEventListener('click', function () {
      speed = parseInt(b.getAttribute('data-speed'), 10);
      $$('[data-speed]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      toast('Geschwindigkeit ' + speed + '× – gilt sofort (simuliert).');
      schedule();
    });
  });
  var pauseBtn = $('[data-pause]');
  if (pauseBtn) pauseBtn.addEventListener('click', function () {
    paused = !paused;
    var l = $('.lbl', pauseBtn);
    if (l) l.textContent = paused ? 'Fortsetzen' : 'Pause';
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    toast(paused ? 'Simulation angehalten.' : 'Simulation läuft weiter.');
  });

  /* ---- switches ---- */
  $$('.sw').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      var t = $('.txt', b); if (t) t.textContent = on ? 'an' : 'aus';
      var out = b.getAttribute('data-out');
      if (out) {
        var o = document.getElementById(out);
        if (o) setText(o, on ? (o.getAttribute('data-on') || 'an') : (o.getAttribute('data-off') || 'aus'));
      }
      var rg = b.getAttribute('data-range');
      if (rg) { var r = document.getElementById(rg); if (r) r.disabled = !on; }
    });
  });

  /* ---- range sliders ---- */
  $$('input[type=range][data-out]').forEach(function (r) {
    r.addEventListener('input', function () {
      var o = document.getElementById(r.getAttribute('data-out'));
      if (o) setText(o, r.value + ' %');
    });
  });

  /* ---- steppers ---- */
  $$('[data-stepper]').forEach(function (st) {
    var val = $('.val', st);
    var step = parseFloat(st.getAttribute('data-step'));
    var min = parseFloat(st.getAttribute('data-min'));
    var max = parseFloat(st.getAttribute('data-max'));
    var dec = parseInt(st.getAttribute('data-dec') || '0', 10);
    var unit = st.getAttribute('data-unit') || '';
    var cur = parseFloat(st.getAttribute('data-value'));
    var minus = $('[data-dir="-1"]', st), plus = $('[data-dir="1"]', st);
    function sync() {
      minus.setAttribute('aria-disabled', cur <= min ? 'true' : 'false');
      plus.setAttribute('aria-disabled', cur >= max ? 'true' : 'false');
    }
    [minus, plus].forEach(function (b) {
      b.addEventListener('click', function () {
        var d = parseInt(b.getAttribute('data-dir'), 10);
        var n = Math.round((cur + d * step) / step) * step;
        if (n < min || n > max) { toast('Wert außerhalb von ' + fmt(min, dec) + ' bis ' + fmt(max, dec) + ' ' + unit + '.', true); return; }
        cur = n;
        val.firstChild.nodeValue = fmt(cur, dec);
        flash(val);
        var row = st.closest('.limit');
        if (row) { row.classList.remove('changed'); void row.offsetWidth; row.classList.add('changed'); }
        var tgt = st.getAttribute('data-target');
        if (tgt) { var t = document.getElementById(tgt); if (t) setText(t, fmt(cur, dec) + ' ' + unit); }
        if (st.hasAttribute('data-set')) { var v = $('.n', document.getElementById(st.getAttribute('data-set'))); if (v) setText(v, fmt(cur, dec)); }
        sync();
      });
    });
    sync();
  });

  /* ---- segmented groups ---- */
  $$('.seg').forEach(function (g) {
    $$('button', g).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('button', g).forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        toast((g.getAttribute('data-name') || 'Einstellung') + ': ' + b.textContent.trim() + ' – wirkt sofort in der Simulation.');
      });
    });
  });

  /* ---- seed field ---- */
  var seedField = $('#seed');
  if (seedField) {
    var err = $('#seed-error');
    var applySeed = function () {
      var v = seedField.value.trim();
      var ok = /^\d{1,9}$/.test(v);
      seedField.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (err) err.hidden = ok;
      if (ok) toast('Seed ' + v + ' gesetzt – gilt ab dem nächsten Start.');
    };
    seedField.addEventListener('change', applySeed);
    var sb = $('#seed-apply'); if (sb) sb.addEventListener('click', applySeed);
  }

  /* ---- events + reset ---- */
  $$('[data-event]').forEach(function (b) {
    b.addEventListener('click', function () {
      toast(b.getAttribute('data-event') + ' ausgelöst – neue Meldung um ' + pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60) + ' (simuliert).');
    });
  });
  var resetBtn = $('[data-reset]');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    var a = $('#reset-auto').checked, t = $('#reset-thr').checked;
    toast('Zurückgesetzt: Haus, Geräte, Uhrzeit, Meldungen, Verlauf' + (a ? ', Automationen' : '') + (t ? ', Schwellwerte' : '') + '.');
  });

  /* ---- acknowledge messages ---- */
  $$('[data-ack]').forEach(function (b) {
    b.addEventListener('click', function () {
      var row = b.closest('.mrow');
      var done = $('#list-done'), open = $('#list-open');
      var now = pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60);
      var act = document.createElement('span');
      act.className = 'act';
      act.textContent = 'bestätigt ' + now;
      b.replaceWith(act);
      done.insertBefore(row, done.firstChild);
      var n = $$('.mrow', open).length;
      setText($('#count-open'), String(n));
      var tc = $('.tab .count'); if (tc) { if (n) setText(tc, String(n)); else tc.remove(); }
      var d = $$('.mrow', done).length; setText($('#count-done'), String(d));
      toast('Meldung bestätigt – bleibt unter „Bestätigt“ einsehbar.');
    });
  });

  /* ---- automation pills ---- */
  function bindPill(p) {
    p.addEventListener('click', function () {
      var on = p.getAttribute('aria-checked') !== 'true';
      p.setAttribute('aria-checked', on ? 'true' : 'false');
      $('span span', p).textContent = on ? 'aktiv' : 'inaktiv';
      toast(on ? 'Automation aktiviert.' : 'Automation deaktiviert – löst nicht mehr aus.');
    });
  }
  $$('.apill').forEach(bindPill);

  var dlg = $('#new-rule');
  if (dlg) {
    var openBtn = $('[data-open-rule]');
    openBtn.addEventListener('click', function () { dlg.showModal(); });
    $$('[data-close]', dlg).forEach(function (c) { c.addEventListener('click', function () { dlg.close(); }); });
    $('form', dlg).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var when = f.when.value, then = f.then.value + (f.notify.checked ? ', mit Meldung' : '');
      var r = document.createElement('article');
      r.className = 'rule';
      r.innerHTML = '<div class="cols"><div class="col"><span class="label">Wenn</span><p></p></div><div class="col"><span class="label">Dann</span><p></p></div></div><footer><button class="apill" role="switch" aria-checked="true"><span><span>aktiv</span></span></button><span class="last">noch nie ausgeführt</span></footer>';
      $$('p', r)[0].textContent = when; $$('p', r)[1].textContent = then;
      bindPill($('.apill', r));
      var list = $('#rules'); list.insertBefore(r, list.firstChild);
      dlg.close();
      toast('Automation angelegt und aktiv.');
    });
  }

  /* ---- chart hover: the value under the pointer (desktop only) ---- */
  var wide = window.matchMedia('(min-width: 960px)');
  function pathPoints(path) {
    var m = (path.getAttribute('d') || '').match(/-?\d*\.?\d+/g) || [], p = [];
    for (var i = 0; i + 1 < m.length; i += 2) p.push([parseFloat(m[i]), parseFloat(m[i + 1])]);
    return p;
  }
  function yAt(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        var a = pts[i - 1], b = pts[i];
        var k = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return pts[pts.length - 1][1];
  }
  function hoverChart(svg, read) {
    var line = $('.ln', svg), wrap = svg.closest('.chartwrap');
    if (!line || !wrap) return;
    var vb = svg.viewBox.baseVal;
    var tip = document.createElement('div');
    tip.className = 'charttip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
    var val = document.createElement('b'), time = document.createElement('span');
    tip.appendChild(val); tip.appendChild(time);
    var dot = document.createElement('i');
    dot.className = 'chartdot'; dot.hidden = true; dot.setAttribute('aria-hidden', 'true');
    wrap.appendChild(tip); wrap.appendChild(dot);
    function hide() { tip.hidden = true; dot.hidden = true; }
    svg.addEventListener('pointermove', function (e) {
      if (!wide.matches) { hide(); return; }
      var pts = pathPoints(line);
      if (pts.length < 2) return;
      var r = svg.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      var x = Math.min(vb.width, Math.max(0, (e.clientX - r.left) / r.width * vb.width));
      var y = yAt(pts, x), out = read(x, y, pts);
      val.textContent = out.v; time.textContent = out.t;
      tip.hidden = false; dot.hidden = false;
      var px = r.left - w.left + x / vb.width * r.width;
      var py = r.top - w.top + y / vb.height * r.height;
      var half = tip.offsetWidth / 2;
      dot.style.left = px + 'px'; dot.style.top = py + 'px';
      tip.style.left = Math.min(w.width - half, Math.max(half, px)) + 'px';
      tip.style.top = py + 'px';
    });
    svg.addEventListener('pointerleave', hide);
  }
  $$('svg.chart[data-hover]').forEach(function (svg) {
    var y0 = parseFloat(svg.getAttribute('data-y0')), v0 = parseFloat(svg.getAttribute('data-v0'));
    var y1 = parseFloat(svg.getAttribute('data-y1')), v1 = parseFloat(svg.getAttribute('data-v1'));
    var unit = svg.getAttribute('data-unit') || '';
    hoverChart(svg, function (x, y) {
      var v = v0 + (y - y0) * (v1 - v0) / (y1 - y0);
      var t = Math.round(7 * 60 + 42 - 60 * (1 - x / 400));
      return { v: fmt(v, 1) + ' ' + unit, t: pad2(Math.floor(t / 60)) + ':' + pad2(t % 60) };
    });
  });

  /* ---- verlauf: series from the running simulation (deterministic) ---- */
  var chart = $('#hist');
  if (chart) {
    var st = { metric: 'temperature', win: '1h', all: false };
    var drawn = false;
    var meta = {
      temperature: { name: 'Temperatur', file: 'temperatur', unit: '°C', lo: 19.5, hi: 22, dec: 1, a: 0.9 },
      humidity: { name: 'Luftfeuchte', file: 'luftfeuchte', unit: '%', lo: 38, hi: 62, dec: 0, a: 2.3 },
      co2: { name: 'CO₂', file: 'co2', unit: 'ppm', lo: 500, hi: 1100, dec: 0, a: 3.4 },
      power: { name: 'Verbrauch', file: 'verbrauch', unit: 'W', lo: 80, hi: 620, dec: 0, a: 4.6 }
    };
    var wins = { '15m': { n: 15, step: 1, label: 'letzte 15 Minuten', f: '15m' }, '1h': { n: 60, step: 1, label: 'letzte Stunde', f: '1h' }, '1d': { n: 96, step: 15, label: 'letzter Tag', f: '1d' } };
    var value = function (m, i, n) {
      var x = i / (n - 1), M = meta[m];
      var w = st.win === '1d' ? 3 : st.win === '1h' ? 1.4 : 0.6;
      var v = 0.5 + 0.28 * Math.sin(x * Math.PI * 2 * w + M.a) + 0.12 * Math.sin(x * Math.PI * 7 * w + M.a * 2) + 0.1 * (x - 0.5);
      return M.lo + (M.hi - M.lo) * Math.min(0.97, Math.max(0.03, v));
    };
    var stamp = function (i, n, step) {
      var back = (n - 1 - i) * step, t = 7 * 60 + 42 - back, day = 'Di';
      if (t < 0) { t += 1440; day = 'Mo'; }
      return (st.win === '1d' ? day + ' ' : '') + pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
    };
    var draw = function () {
      var w = wins[st.win], M = meta[st.metric], pts = [], H = 200;
      drawn = true;
      for (var i = 0; i < w.n; i++) {
        var v = value(st.metric, i, w.n);
        pts.push([(i / (w.n - 1)) * 400, H - 16 - ((v - M.lo) / (M.hi - M.lo)) * (H - 40)]);
      }
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      $('#hist-line').setAttribute('d', d);
      $('#hist-area').setAttribute('d', d + ' L400 ' + H + ' L0 ' + H + ' Z');
      var last = value(st.metric, w.n - 1, w.n);
      setText($('#y-max'), fmt(M.hi, M.dec) + ' ' + M.unit);
      setText($('#y-min'), fmt(M.lo, M.dec) + ' ' + M.unit);
      setText($('#now-val'), fmt(last, M.dec) + ' ' + M.unit);
      var ticks = $$('#x-axis span');
      ticks[0].textContent = stamp(0, w.n, w.step);
      ticks[1].textContent = stamp(Math.round((w.n - 1) / 2), w.n, w.step);
      ticks[2].textContent = stamp(w.n - 1, w.n, w.step);
      $('#series-name').innerHTML = 'Wohnzimmer · <b>' + M.name + '</b> · ' + w.label + ' · Simulation';
      var fname = 'wohnzimmer_' + (st.all ? 'alle-messgroessen' : M.file) + '_' + w.f + '.csv';
      $('#fname').textContent = fname;
    };
    $$('[data-win]').forEach(function (b) {
      b.addEventListener('click', function () {
        st.win = b.getAttribute('data-win');
        $$('[data-win]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        draw();
      });
    });
    $$('[data-metric]').forEach(function (b) {
      b.addEventListener('click', function () {
        st.metric = b.getAttribute('data-metric');
        $$('[data-metric]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        draw();
      });
    });
    hoverChart(chart, function (x, y, pts) {
      var n = pts.length, i = Math.round(x / 400 * (n - 1)), M = meta[st.metric], v;
      if (drawn) {
        v = M.lo + ((200 - 16 - y) / (200 - 40)) * (M.hi - M.lo);
      } else {
        var vmax = parseFloat($('#y-max').textContent.replace(',', '.'));
        var vmin = parseFloat($('#y-min').textContent.replace(',', '.'));
        var ys = pts.map(function (p) { return p[1]; });
        var top = Math.min.apply(null, ys), bottom = Math.max.apply(null, ys);
        v = vmin + (bottom - y) / (bottom - top) * (vmax - vmin);
      }
      return { v: fmt(v, M.dec) + ' ' + M.unit, t: stamp(i, n, drawn ? wins[st.win].step : 6) };
    });
    var allBox = $('#all4');
    allBox.addEventListener('change', function () { st.all = allBox.checked; draw(); });
    $('[data-download]').addEventListener('click', function () {
      var w = wins[st.win], rows, head;
      var keys = st.all ? ['temperature', 'humidity', 'co2', 'power'] : [st.metric];
      head = ['zeit'].concat(keys.map(function (k) { return meta[k].file + '_' + meta[k].unit; }));
      rows = [head.join(',')];
      for (var i = 0; i < w.n; i++) {
        rows.push([stamp(i, w.n, w.step)].concat(keys.map(function (k) { return value(k, i, w.n).toFixed(meta[k].dec + 1 > 2 ? 2 : meta[k].dec + 1); })).join(','));
      }
      var blob = new Blob(['\uFEFF' + rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = $('#fname').textContent;
      document.body.appendChild(a); a.click(); a.remove();
      toast('CSV bereit: ' + a.download);
    });
  }
})();
