/* Metro-map background: four coloured lines, stations, interchanges and trains
   that travel along the lines. Replaces the old skyline scene. */
(function () {
  var scene = document.getElementById('metro-scene');
  if (!scene) return;
  var NS = 'http://www.w3.org/2000/svg';
  var LINES = [
    { c: '--line-blue',   d: 'M-60 720H300L520 500H960L1160 300H1660', t: [30, 42] },
    { c: '--line-coral',  d: 'M220 -60V190L380 350V640L580 840V960',   t: [34, 46] },
    { c: '--line-teal',   d: 'M-60 170H420L620 370H1080L1300 590H1660', t: [38, 50] },
    { c: '--line-violet', d: 'M1660 800H1230L1010 580V-60',            t: [32, 44] }
  ];
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  var wrap = document.createElement('div');
  wrap.className = 'scene-map';
  var svg = el('svg', { viewBox: '0 0 1600 900', preserveAspectRatio: 'xMidYMid slice' }, wrap);
  var defs = el('defs', {}, svg);
  var gLines = el('g', { class: 'map-lines' }, svg);
  var gStops = el('g', { class: 'map-stops' }, svg);
  var gTrains = el('g', { class: 'map-trains' }, svg);
  var samples = [];

  LINES.forEach(function (ln, i) {
    var color = 'var(' + ln.c + ')';
    var p = el('path', { id: 'map-line-' + i, d: ln.d, class: 'map-line', style: 'stroke:' + color + ';--len:3200' }, gLines);
    var len = p.getTotalLength();
    p.style.setProperty('--len', Math.ceil(len));
    p.style.animationDelay = (i * 0.25) + 's';
    var pts = [];
    for (var s = 0; s <= len; s += 6) { var q = p.getPointAtLength(s); pts.push([q.x, q.y]); }
    samples.push(pts);
    for (var d = 110; d < len - 60; d += 170) {
      var sp = p.getPointAtLength(d);
      if (sp.x < 20 || sp.x > 1580 || sp.y < 20 || sp.y > 880) continue;
      el('circle', { cx: sp.x, cy: sp.y, r: 7, class: 'map-stop', style: 'stroke:' + color }, gStops);
    }
    [0, 1].forEach(function (k) {
      var g = el('g', { class: 'map-train' }, gTrains);
      el('rect', { x: -52, y: -5, width: 52, height: 10, rx: 5, class: 'map-trail', style: 'fill:' + color }, g);
      el('rect', { x: -14, y: -7, width: 36, height: 14, rx: 7, class: 'map-car', style: 'fill:' + color }, g);
      el('rect', { x: -7, y: -3, width: 22, height: 4, rx: 2, class: 'map-win' }, g);
      var m = el('animateMotion', {
        dur: ln.t[k] + 's', repeatCount: 'indefinite', rotate: 'auto',
        begin: '-' + (k * ln.t[k] / 2 + i * 3) + 's',
        keyPoints: k ? '1;0' : '0;1', keyTimes: '0;1', calcMode: 'linear'
      }, g);
      el('mpath', { href: '#map-line-' + i }, m);
    });
  });

  /* interchanges: where two lines pass within a few pixels of each other */
  var found = [];
  for (var a = 0; a < samples.length; a++) for (var b = a + 1; b < samples.length; b++) {
    var hit = null;
    samples[a].forEach(function (pa) {
      if (hit) return;
      for (var j = 0; j < samples[b].length; j++) {
        var pb = samples[b][j];
        if (Math.abs(pa[0] - pb[0]) < 8 && Math.abs(pa[1] - pb[1]) < 8) { hit = pa; return; }
      }
    });
    if (hit && hit[0] > 0 && hit[0] < 1600 && hit[1] > 0 && hit[1] < 900) found.push(hit);
  }
  found.forEach(function (pt, n) {
    el('circle', { cx: pt[0], cy: pt[1], r: 18, class: 'map-pulse', style: 'animation-delay:' + (n * 0.9) + 's' }, gStops);
    el('circle', { cx: pt[0], cy: pt[1], r: 12, class: 'map-hub' }, gStops);
    el('circle', { cx: pt[0], cy: pt[1], r: 5, class: 'map-hub-core' }, gStops);
  });

  scene.insertBefore(wrap, scene.firstChild);
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced && svg.pauseAnimations) svg.pauseAnimations();
  document.addEventListener('visibilitychange', function () {
    if (!svg.pauseAnimations || reduced) return;
    document.hidden ? svg.pauseAnimations() : svg.unpauseAnimations();
  });
})();
