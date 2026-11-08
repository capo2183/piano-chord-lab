/*
 * fingering.js — 依琴鍵實際分布計算建議指法
 *
 * 以「手指對的舒適跨距」做成本模型，對所有可能的手指組合求最低成本。
 * 因此 C6（C E G A）會得到 1-2-4-5，而 Cmaj7（C E G B）會得到 1-2-3-5。
 * 1 = 拇指、2 = 食指、3 = 中指、4 = 無名指、5 = 小指
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PCL = root.PCL || {}; root.PCL.fingering = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FINGER_ZH = { 1: '拇指', 2: '食指', 3: '中指', 4: '無名指', 5: '小指' };

  /* 手指對 (小號碼-大號碼) 的舒適跨距（半音）：[最小, 最大, 理想] */
  var PAIR_SPAN = {
    '1-2': [1, 5, 2.5],
    '1-3': [3, 7, 4],
    '1-4': [5, 9, 6],
    '1-5': [5, 12, 7],
    '2-3': [1, 4, 3],
    '2-4': [3, 6, 4],
    '2-5': [4, 8, 6],
    '3-4': [1, 3, 2],
    '3-5': [3, 5, 4],
    '4-5': [1, 3, 1.5]
  };

  var BLACK_PC = { 1: true, 3: true, 6: true, 8: true, 10: true };
  function isBlack(midi) { return !!BLACK_PC[((midi % 12) + 12) % 12]; }

  function pairCost(fa, fb, semis) {
    var lo = Math.min(fa, fb), hi = Math.max(fa, fb);
    var span = PAIR_SPAN[lo + '-' + hi];
    var c = 0.1 * Math.pow(semis - span[2], 2);
    if (semis < span[0]) c += 2 * Math.pow(span[0] - semis, 2);
    if (semis > span[1]) c += 2 * Math.pow(semis - span[1], 2);
    return c;
  }

  /** 從 pool 中取 k 個（保持順序）的所有組合 */
  function combinations(pool, k) {
    var out = [];
    (function rec(start, acc) {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (var i = start; i < pool.length; i++) { acc.push(pool[i]); rec(i + 1, acc); acc.pop(); }
    })(0, []);
    return out;
  }

  function sequenceCost(midis, fingers, outerFinger) {
    var c = 0;
    for (var i = 1; i < midis.length; i++) c += pairCost(fingers[i - 1], fingers[i], midis[i] - midis[i - 1]);
    var n = midis.length;
    if (n >= 3) c += pairCost(fingers[0], fingers[n - 1], midis[n - 1] - midis[0]);
    // 三個音以上、跨距達五度左右時，最高音優先用「外側」手指（右手小指 5、左手拇指 1）
    if (n >= 3 && midis[n - 1] - midis[0] >= 6 && fingers[n - 1] !== outerFinger.top) c += 0.3;
    // 拇指盡量不要落在被白鍵包夾的黑鍵上（只影響平手時的選擇）
    for (var j = 0; j < n; j++) if (fingers[j] === 1 && isBlack(midis[j])) c += 0.05;
    return c;
  }

  function best(midis, candidates, topFinger) {
    var bestF = null, bestC = Infinity;
    candidates.forEach(function (f) {
      var c = sequenceCost(midis, f, { top: topFinger });
      if (c < bestC - 1e-9) { bestC = c; bestF = f; }
    });
    return { fingers: bestF, cost: bestC };
  }

  /** 右手：由低到高的 MIDI 陣列 → 手指編號陣列 */
  function rightHand(midis) {
    if (!midis.length) return [];
    if (midis.length === 1) return [1];
    if (midis.length > 5) throw new Error('右手一次最多 5 個音');
    // 原位和弦的右手最低音固定使用拇指
    var cands = combinations([1, 2, 3, 4, 5], midis.length).filter(function (f) { return f[0] === 1; });
    var r = best(midis, cands, 5);
    return r.fingers;
  }

  /** 左手：由低到高的 MIDI 陣列 → 手指編號陣列（最低音通常為小指 5） */
  function leftHand(midis) {
    if (!midis.length) return [];
    if (midis.length === 1) return [5];
    if (midis.length > 5) throw new Error('左手一次最多 5 個音');
    // 左手最低音固定使用小指
    var cands = combinations([5, 4, 3, 2, 1], midis.length).filter(function (f) { return f[0] === 5; });
    var r = best(midis, cands, 1);
    return r.fingers;
  }

  return {
    FINGER_ZH: FINGER_ZH,
    isBlack: isBlack,
    pairCost: pairCost,
    rightHand: rightHand,
    leftHand: leftHand
  };
});
