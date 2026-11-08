/*
 * keyboard.js — 互動式鋼琴鍵盤 SVG
 *
 * - 自動選擇剛好容納和弦的音域（手機上不需橫向捲動）
 * - 右手 / 左手以不同顏色標示，並在琴鍵上標示音名與手指編號
 * - 黑鍵標示放在鍵盤上方的標籤列，確保手機上清楚可讀
 */
(function (root, factory) {
  var api;
  if (typeof module === 'object' && module.exports) { api = factory(require('./fingering.js')); module.exports = api; }
  else { api = factory(root.PCL.fingering); root.PCL.keyboard = api; }
})(typeof self !== 'undefined' ? self : this, function (fingering) {
  'use strict';

  var WW = 24;      // 白鍵寬
  var WH = 128;     // 白鍵高
  var BW = 15;      // 黑鍵寬
  var BH = 80;      // 黑鍵高
  var TOP = 46;     // 上方黑鍵標籤列高度
  var MIN_WHITE = 10;
  var WHITE_PC_NAMES = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

  function isBlack(m) { return fingering.isBlack(m); }
  function f(n) { return Math.round(n * 100) / 100; }

  /** 計算顯示音域（回傳白鍵起訖 MIDI） */
  function computeRange(midis) {
    var lo = Math.min.apply(null, midis), hi = Math.max.apply(null, midis);
    var start = lo; while (isBlack(start)) start--;
    var end = hi; while (isBlack(end)) end++;
    // 兩側各多留一個白鍵
    start--; while (isBlack(start)) start--;
    end++; while (isBlack(end)) end++;
    var count = function () { var c = 0; for (var m = start; m <= end; m++) if (!isBlack(m)) c++; return c; };
    var toggle = true;
    while (count() < MIN_WHITE) {
      if (toggle) { end++; while (isBlack(end)) end++; }
      else { start--; while (isBlack(start)) start--; }
      toggle = !toggle;
    }
    return { start: start, end: end, whiteCount: count() };
  }

  function escapeXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  var SEG_GAP = 18;          // 分段鍵盤之間的間隔寬度
  var MAX_CONTIGUOUS = 16;   // 超過這個白鍵數就嘗試分段顯示

  function whiteCountBetween(a, b) { var c = 0; for (var m = a; m <= b; m++) if (!isBlack(m)) c++; return c; }

  /**
   * 將音分成數個區段：當左右手相距很遠時，中間省略的琴鍵以「≈」表示，
   * 讓手機上不需要橫向捲動也能看清楚每個琴鍵。
   */
  function computeSegments(midis) {
    var sorted = midis.slice().sort(function (a, b) { return a - b; });
    var full = computeRange(sorted);
    if (full.whiteCount <= MAX_CONTIGUOUS) return [full];
    var groups = [[sorted[0]]];
    for (var i = 1; i < sorted.length; i++) {
      var gapWhites = whiteCountBetween(sorted[i - 1] + 1, sorted[i] - 1);
      if (gapWhites > 5) groups.push([sorted[i]]);
      else groups[groups.length - 1].push(sorted[i]);
    }
    if (groups.length === 1) return [full];
    return groups.map(function (g) {
      var lo = Math.min.apply(null, g), hi = Math.max.apply(null, g);
      var start = lo; while (isBlack(start)) start--;
      start--; while (isBlack(start)) start--;
      var end = hi; while (isBlack(end)) end++;
      end++; while (isBlack(end)) end++;
      return { start: start, end: end, whiteCount: whiteCountBetween(start, end) };
    });
  }

  /**
   * @param {Array} notes  [{ midi, name, finger, hand: 'R'|'L' }]
   * @param {object} opts  { showNames, showFingers }
   */
  function render(notes, opts) {
    opts = opts || {};
    var showNames = opts.showNames !== false;
    var showFingers = opts.showFingers !== false;
    var segments = computeSegments(notes.map(function (n) { return n.midi; }));
    var byMidi = {};
    notes.forEach(function (n) { byMidi[n.midi] = n; });

    var whites = [], blacks = [], breaks = [];
    var x = 0;
    segments.forEach(function (seg, si) {
      if (si > 0) { breaks.push(x + SEG_GAP / 2); x += SEG_GAP; }
      for (var m = seg.start; m <= seg.end; m++) {
        if (isBlack(m)) blacks.push({ midi: m, x: x - BW / 2 });
        else { whites.push({ midi: m, x: x }); x += WW; }
      }
    });
    var width = x;
    var height = TOP + WH + 2;

    var labelList = notes.map(function (n) { return n.name + (n.hand === 'L' ? '（左手）' : '（右手）') + (showFingers && n.finger ? ' 手指 ' + n.finger : ''); });
    var out = ['<svg class="kb-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height +
      '" role="img" aria-label="鋼琴鍵盤：' + escapeXml(labelList.join('、')) + '">'];

    function fingerBadge(cx, cy, n, r) {
      return '<g class="finger-badge ' + (n.hand === 'L' ? 'lh' : 'rh') + '">' +
        '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + r + '"/>' +
        '<text x="' + f(cx) + '" y="' + f(cy + 0.5) + '" dominant-baseline="central" text-anchor="middle">' + n.finger + '</text></g>';
    }

    whites.forEach(function (k) {
      var n = byMidi[k.midi];
      var cls = 'key white' + (n ? ' on ' + (n.hand === 'L' ? 'lh' : 'rh') : '');
      out.push('<rect class="' + cls + '" data-midi="' + k.midi + '"' + (n ? ' data-on="1"' : '') +
        ' x="' + f(k.x + 0.5) + '" y="' + TOP + '" width="' + (WW - 1) + '" height="' + WH + '" rx="3"/>');
    });
    blacks.forEach(function (k) {
      var n = byMidi[k.midi];
      var cls = 'key black' + (n ? ' on ' + (n.hand === 'L' ? 'lh' : 'rh') : '');
      out.push('<rect class="' + cls + '" data-midi="' + k.midi + '"' + (n ? ' data-on="1"' : '') +
        ' x="' + f(k.x) + '" y="' + TOP + '" width="' + BW + '" height="' + BH + '" rx="2"/>');
    });

    // 省略符號
    breaks.forEach(function (bx) {
      var y0 = TOP + 20, y1 = TOP + WH - 20;
      out.push('<path class="kb-break" d="M ' + f(bx - 3) + ' ' + y0 + ' l 6 8 l -6 8 l 6 8 l -6 8 l 6 8 l -6 8 l 6 8 l -6 8 l 6 8"/>');
      out.push('<text class="kb-break-label" x="' + f(bx) + '" y="' + (y1 + 14) + '" text-anchor="middle">…</text>');
    });

    // C 鍵的八度標記（例如 C4 = 中央 C）
    whites.forEach(function (k) {
      if (k.midi % 12 === 0 && !byMidi[k.midi]) {
        out.push('<text class="kb-c4" x="' + f(k.x + WW / 2) + '" y="' + (TOP + WH - 8) + '" text-anchor="middle">C' + (k.midi / 12 - 1) + '</text>');
      }
    });

    whites.forEach(function (k) {
      var n = byMidi[k.midi]; if (!n) return;
      var cx = k.x + WW / 2;
      if (showFingers && n.finger) out.push(fingerBadge(cx, TOP + WH - 42, n, 9.5));
      if (showNames) out.push('<text class="kb-name" x="' + f(cx) + '" y="' + (TOP + WH - 12) + '" text-anchor="middle">' + escapeXml(n.name) + '</text>');
    });
    blacks.forEach(function (k) {
      var n = byMidi[k.midi]; if (!n) return;
      var cx = k.x + BW / 2;
      if (showNames) out.push('<text class="kb-name top" x="' + f(cx) + '" y="13" text-anchor="middle">' + escapeXml(n.name) + '</text>');
      if (showFingers && n.finger) out.push(fingerBadge(cx, 32, n, 9.5));
      if (showNames || showFingers) out.push('<line class="kb-pointer" x1="' + f(cx) + '" y1="' + (showFingers ? 42 : 18) + '" x2="' + f(cx) + '" y2="' + (TOP + 4) + '"/>');
    });

    out.push('</svg>');
    return { svg: out.join(''), segments: segments, width: width, height: height, whiteCount: whites.length };
  }

  return { render: render, computeRange: computeRange, computeSegments: computeSegments, WHITE_PC_NAMES: WHITE_PC_NAMES };
});
