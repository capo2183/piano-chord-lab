/*
 * staff.js — 動態產生五線譜 SVG
 *
 * - 高音譜號：右手和弦；低音譜號：左手音（斜線低音或分手時的低音）
 * - 依字母 + 八度計算位置，正確處理升降記號、重升重降、加線
 * - 相鄰二度的符頭向右錯開，臨時記號分欄避免重疊
 * - 每個符頭帶有 data-midi，方便測試五線譜與鍵盤音高一致
 */
(function (root, factory) {
  var api;
  if (typeof module === 'object' && module.exports) { api = factory(require('./theory.js')); module.exports = api; }
  else { api = factory(root.PCL.theory); root.PCL.staff = api; }
})(typeof self !== 'undefined' ? self : this, function (theory) {
  'use strict';

  var S = 10;            // 線距
  var HALF = S / 2;
  var HEAD_W = 13;       // 符頭寬
  var ACC_COL_W = 11;    // 臨時記號欄寬
  var CLEF_W = 44;

  var CLEFS = {
    treble: { bottomLine: 30 /* E4 */, topLine: 38 /* F5 */ },
    bass:   { bottomLine: 18 /* G2 */, topLine: 26 /* A3 */ }
  };

  function f(n) { return Math.round(n * 100) / 100; }

  /* ---------- 符號圖形 ---------- */

  function trebleClef(x, top) {
    // x：譜號中心，top：五線譜第一線 y。G 線（第二線）在 top + 30
    var g = top + 3 * S;
    var p = [
      'M', x + 2, g + 2,
      'C', x + 7, g + 1, x + 6, g - 7, x, g - 7,
      'C', x - 8, g - 7, x - 10, g + 6, x - 1, g + 9,
      'C', x + 8, g + 11, x + 13, g + 2, x + 8, g - 5,
      'C', x + 4, g - 11, x - 5, g - 18, x - 4, g - 32,
      'C', x - 3, g - 42, x + 6, g - 44, x + 6, g - 36,
      'C', x + 6, g - 28, x - 2, g - 24, x - 2, g - 18,
      'L', x + 4, g + 21,
      'C', x + 5, g + 28, x - 1, g + 30, x - 5, g + 26
    ].map(function (v) { return typeof v === 'number' ? f(v) : v; }).join(' ');
    return '<g class="clef" aria-hidden="true">' +
      '<path d="' + p + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + f(x - 3.5) + '" cy="' + f(g + 24.5) + '" r="3" fill="currentColor"/></g>';
  }

  function bassClef(x, top) {
    var fy = top + S; // F 線（第四線，自上數第二線）
    var p = ['M', x - 6, fy,
      'C', x - 7, fy - 9, x + 9, fy - 10, x + 10, fy,
      'C', x + 11, fy + 11, x + 1, fy + 20, x - 8, fy + 25
    ].map(function (v) { return typeof v === 'number' ? f(v) : v; }).join(' ');
    return '<g class="clef" aria-hidden="true">' +
      '<circle cx="' + f(x - 4) + '" cy="' + f(fy) + '" r="3.6" fill="currentColor"/>' +
      '<path d="' + p + '" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>' +
      '<circle cx="' + f(x + 16) + '" cy="' + f(fy - 5) + '" r="1.9" fill="currentColor"/>' +
      '<circle cx="' + f(x + 16) + '" cy="' + f(fy + 5) + '" r="1.9" fill="currentColor"/></g>';
  }

  function sharp(x, y) {
    return '<g class="acc">' +
      '<line x1="' + f(x - 2) + '" y1="' + f(y - 8) + '" x2="' + f(x - 2) + '" y2="' + f(y + 9) + '" stroke="currentColor" stroke-width="1.2"/>' +
      '<line x1="' + f(x + 2) + '" y1="' + f(y - 9) + '" x2="' + f(x + 2) + '" y2="' + f(y + 8) + '" stroke="currentColor" stroke-width="1.2"/>' +
      '<line x1="' + f(x - 4.5) + '" y1="' + f(y - 1.5) + '" x2="' + f(x + 4.5) + '" y2="' + f(y - 4) + '" stroke="currentColor" stroke-width="2.4"/>' +
      '<line x1="' + f(x - 4.5) + '" y1="' + f(y + 4) + '" x2="' + f(x + 4.5) + '" y2="' + f(y + 1.5) + '" stroke="currentColor" stroke-width="2.4"/></g>';
  }

  function flatPath(x, y) {
    return '<line x1="' + f(x - 3) + '" y1="' + f(y - 12) + '" x2="' + f(x - 3) + '" y2="' + f(y + 4.5) + '" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M ' + f(x - 3) + ' ' + f(y + 4.5) + ' C ' + f(x + 6) + ' ' + f(y - 0.5) + ' ' + f(x + 5) + ' ' + f(y - 6) +
      ' ' + f(x - 3) + ' ' + f(y - 1.5) + '" fill="none" stroke="currentColor" stroke-width="1.8"/>';
  }

  function flat(x, y) { return '<g class="acc">' + flatPath(x, y) + '</g>'; }
  function doubleFlat(x, y) { return '<g class="acc">' + flatPath(x - 3.5, y) + flatPath(x + 3.5, y) + '</g>'; }

  function doubleSharp(x, y) {
    var d = 3.6;
    return '<g class="acc">' +
      '<line x1="' + f(x - d) + '" y1="' + f(y - d) + '" x2="' + f(x + d) + '" y2="' + f(y + d) + '" stroke="currentColor" stroke-width="1.6"/>' +
      '<line x1="' + f(x - d) + '" y1="' + f(y + d) + '" x2="' + f(x + d) + '" y2="' + f(y - d) + '" stroke="currentColor" stroke-width="1.6"/>' +
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(function (c) {
        return '<rect x="' + f(x + c[0] * d - 1.6) + '" y="' + f(y + c[1] * d - 1.6) + '" width="3.2" height="3.2" fill="currentColor"/>';
      }).join('') + '</g>';
  }

  function accidental(acc, x, y) {
    if (acc === 1) return sharp(x, y);
    if (acc === -1) return flat(x, y);
    if (acc === 2) return doubleSharp(x, y);
    if (acc === -2) return doubleFlat(x, y);
    return '';
  }

  function accWidth(acc) { return acc === -2 ? ACC_COL_W + 4 : ACC_COL_W; }

  function wholeNote(x, y, cls, n) {
    return '<g class="note ' + cls + '" data-midi="' + n.midi + '" data-name="' + n.fullName + '">' +
      '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="6.6" ry="4.7" fill="currentColor"/>' +
      '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="3.1" ry="2.3" transform="rotate(-35 ' + f(x) + ' ' + f(y) + ')" fill="var(--paper, #fbf8f1)"/></g>';
  }

  /* ---------- 版面計算（純計算，可測試） ---------- */

  /**
   * 對一個譜表上的音做版面配置：二度錯位、臨時記號分欄、加線
   * notes: [{ letter, acc, octave, midi }]
   */
  function layoutChord(notes, clefName) {
    var clef = CLEFS[clefName];
    var items = notes.map(function (n) {
      return { n: n, d: theory.diatonicIndex(n), acc: n.acc, displaced: false, accCol: -1 };
    }).sort(function (a, b) { return a.d - b.d || a.acc - b.acc; });

    // 相鄰二度：由下往上，若與前一音相差一個級數且前一音未錯位，則此音向右錯位
    for (var i = 1; i < items.length; i++) {
      if (items[i].d - items[i - 1].d <= 1 && !items[i - 1].displaced) items[i].displaced = true;
    }

    // 臨時記號：由上往下分欄，同欄記號至少相隔 6 個級數
    var cols = [];
    for (var j = items.length - 1; j >= 0; j--) {
      var it = items[j];
      if (!it.acc) continue;
      var c = 0;
      while (cols[c] && cols[c].some(function (d) { return Math.abs(d - it.d) < 6; })) c++;
      (cols[c] = cols[c] || []).push(it.d);
      it.accCol = c;
    }

    // 加線
    var ledgers = [];
    items.forEach(function (it) {
      var d;
      if (it.d < clef.bottomLine - 1) {
        for (d = clef.bottomLine - 2; d >= it.d; d -= 2) ledgers.push({ d: d, displaced: it.displaced });
      } else if (it.d > clef.topLine + 1) {
        for (d = clef.topLine + 2; d <= it.d; d += 2) ledgers.push({ d: d, displaced: it.displaced });
      }
    });

    return { items: items, accCols: cols.length, ledgers: ledgers };
  }

  function yFor(d, clefName, top) {
    return top + 4 * S - (d - CLEFS[clefName].bottomLine) * HALF;
  }

  function staffExtent(items, clefName, top) {
    var minY = top, maxY = top + 4 * S;
    items.forEach(function (it) {
      var y = yFor(it.d, clefName, top);
      minY = Math.min(minY, y - 14);
      maxY = Math.max(maxY, y + 8);
    });
    return { minY: minY, maxY: maxY };
  }

  /**
   * 產生五線譜 SVG
   * @param {object} voicing  voicing.voice() 的結果
   * @param {object} opts     { title }
   * @returns {{ svg: string, notes: Array<{midi, clef, d, acc}> }}
   */
  function render(voicing, opts) {
    opts = opts || {};
    var rh = voicing.rh, lh = voicing.lh;
    var grand = lh.length > 0;

    var tLayout = layoutChord(rh, 'treble');
    var bLayout = grand ? layoutChord(lh, 'bass') : null;

    var accCols = Math.max(tLayout.accCols, bLayout ? bLayout.accCols : 0);
    var hasDoubleFlat = rh.concat(lh).some(function (n) { return n.acc === -2; });
    var left = 14;
    var clefX = left + 22;
    var noteX = left + CLEF_W + 14 + accCols * ACC_COL_W + (hasDoubleFlat ? 4 : 0) + 6;
    var width = noteX + HEAD_W + 34;

    // 垂直版面：先以 0 為高音譜表頂線算出範圍，再平移
    var trebleTop = 0;
    var tExt = staffExtent(tLayout.items, 'treble', trebleTop);
    var bassTop = 0, bExt = null;
    if (grand) {
      var tentativeBassTop = trebleTop + 4 * S + 32;
      bExt = staffExtent(bLayout.items, 'bass', tentativeBassTop);
      var overlap = tExt.maxY + 8 - bExt.minY;
      bassTop = tentativeBassTop + Math.max(0, overlap);
      bExt = staffExtent(bLayout.items, 'bass', bassTop);
    }
    var minY = Math.min(tExt.minY, trebleTop - 34) - 6;   // 預留譜號上緣
    var maxY = grand ? Math.max(bExt.maxY, bassTop + 4 * S + 6) : Math.max(tExt.maxY, trebleTop + 4 * S + 28);
    var shift = -minY;
    trebleTop += shift; bassTop += shift;
    var height = maxY + shift + 8;

    var out = [];
    var noteInfo = [];
    var aria = opts.title || '五線譜';
    out.push('<svg class="staff-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(width) + ' ' + f(height) +
      '" role="img" aria-label="' + aria + '">');

    function drawStaff(top, clefName, layout, cls) {
      var s = '';
      for (var i = 0; i < 5; i++) {
        var y = top + i * S;
        s += '<line x1="' + left + '" y1="' + f(y) + '" x2="' + f(width - 8) + '" y2="' + f(y) + '" stroke="currentColor" stroke-width="1" opacity="0.75"/>';
      }
      s += clefName === 'treble' ? trebleClef(clefX, top) : bassClef(clefX - 2, top);
      layout.ledgers.forEach(function (l) {
        var y = yFor(l.d, clefName, top);
        var x1 = noteX - 10, x2 = noteX + 10 + (l.displaced ? HEAD_W : 0);
        s += '<line class="ledger" x1="' + f(x1) + '" y1="' + f(y) + '" x2="' + f(x2) + '" y2="' + f(y) + '" stroke="currentColor" stroke-width="1.3"/>';
      });
      // 若有錯位音，另一側的加線也要涵蓋
      layout.items.forEach(function (it) {
        var y = yFor(it.d, clefName, top);
        var x = noteX + (it.displaced ? HEAD_W : 0);
        if (it.acc) {
          var ax = noteX - 9 - it.accCol * ACC_COL_W - (it.acc === -2 ? 4 : 0) - 3;
          s += accidental(it.acc, ax, y);
        }
        s += wholeNote(x, y, cls, it.n);
        noteInfo.push({ midi: it.n.midi, clef: clefName, d: it.d, acc: it.acc, displaced: it.displaced, x: x, y: y });
      });
      return s;
    }

    out.push('<g class="staff staff-treble">' + drawStaff(trebleTop, 'treble', tLayout, 'rh') + '</g>');
    if (grand) {
      out.push('<g class="staff staff-bass">' + drawStaff(bassTop, 'bass', bLayout, 'lh') + '</g>');
      // 大譜表左側連接線
      out.push('<line x1="' + left + '" y1="' + f(trebleTop) + '" x2="' + left + '" y2="' + f(bassTop + 4 * S) + '" stroke="currentColor" stroke-width="1.5"/>');
      out.push('<text x="' + f(width - 6) + '" y="' + f(trebleTop - 6) + '" text-anchor="end" class="staff-hand">右手</text>');
      out.push('<text x="' + f(width - 6) + '" y="' + f(bassTop - 6) + '" text-anchor="end" class="staff-hand lh">左手</text>');
    }
    // 終止線
    out.push('<line x1="' + f(width - 8) + '" y1="' + f(trebleTop) + '" x2="' + f(width - 8) + '" y2="' + f(grand ? bassTop + 4 * S : trebleTop + 4 * S) + '" stroke="currentColor" stroke-width="1"/>');
    out.push('</svg>');

    return { svg: out.join(''), notes: noteInfo, width: width, height: height };
  }

  return { render: render, layoutChord: layoutChord, CLEFS: CLEFS };
});
