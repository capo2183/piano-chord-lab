'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theory.js');
const Q = require('../js/quiz.js');
const St = require('../js/storage.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('每個模式連續出題：不會連續兩題相同，且題目屬於該模式', () => {
  for (const mode of Object.keys(Q.MODES)) {
    const rng = seeded(42 + mode.charCodeAt(0));
    let prev = null;
    const seen = new Set();
    for (let i = 0; i < 1500; i++) {
      const c = Q.nextChord({ mode, prevId: prev, rng });
      assert.notEqual(c.id, prev, `${mode} 第 ${i} 題重複`);
      assert.ok(Q.idInMode(c.id, mode), `${mode}: ${c.id}`);
      prev = c.id;
      seen.add(c.id);
    }
    if (mode === 'A') assert.equal(seen.size, 5);
    else assert.ok(seen.size > 40, `${mode} 題目多樣性 ${seen.size}`);
  }
});

test('模式 A 只出五個指定和弦，並保留原寫法', () => {
  const rng = seeded(7);
  const labels = new Set();
  for (let i = 0; i < 200; i++) labels.add(Q.nextChord({ mode: 'A', rng }).label);
  assert.deepEqual([...labels].sort(), ['C♯m7(-5)/F♯', 'C♯m7(9)', 'D♯m7', 'G♯m7', 'Emaj7'].sort());
});

test('各模式的和弦類型', () => {
  const rng = seeded(3);
  const typesOf = (mode) => {
    const s = new Set();
    for (let i = 0; i < 3000; i++) { const c = Q.nextChord({ mode, rng }); if (!c.isSlash) s.add(c.typeKey); }
    return [...s].sort();
  };
  assert.deepEqual(typesOf('B'), ['aug', 'dim', 'm', 'maj', 'sus2', 'sus4']);
  assert.deepEqual(typesOf('C'), ['7', '7sus4', 'dim7', 'm7', 'm7b5', 'mMaj7', 'maj7']);
  assert.ok(typesOf('D').includes('13') && typesOf('D').includes('11') && typesOf('D').includes('m9'));
  assert.equal(typesOf('E').length, Object.keys(T.CHORD_TYPES).length);
});

test('不熟悉的和弦會優先重複出現', () => {
  const rng = seeded(11);
  let hits = 0;
  let prev = null;
  for (let i = 0; i < 1000; i++) {
    const c = Q.nextChord({ mode: 'E', prevId: prev, weakIds: ['Ebm7b5'], rng });
    if (c.id === 'Ebm7b5') hits++;
    prev = c.id;
  }
  assert.ok(hits > 150, '不熟和弦出現次數 ' + hits);   // 隨機情況下約 1/700
  // 不屬於該模式的不熟和弦不會出現
  for (let i = 0; i < 200; i++) assert.notEqual(Q.nextChord({ mode: 'B', weakIds: ['Ebm7b5'], rng }).id, 'Ebm7b5');
  // 模式 A 複習時保留原本寫法
  const c = Q.nextChord({ mode: 'A', weakIds: ['C#m9'], rng: () => 0 });
  assert.equal(c.label, 'C♯m7(9)');
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('localStorage 保存與讀回', () => {
  const ls = memoryStorage();
  const s1 = St.createStore(ls);
  assert.equal(s1.persistent, true);
  s1.markSeen('Emaj7', 'Emaj7');
  s1.record('Emaj7', 'Emaj7', 'unsure');
  s1.markSeen('D#m7', 'D♯m7');
  s1.record('D#m7', 'D♯m7', 'correct');
  s1.setPref('mode', 'C');
  const s2 = St.createStore(ls);
  assert.equal(s2.get().total, 2);
  assert.equal(s2.get().correct, 1);
  assert.deepEqual(s2.weakIds(), ['Emaj7']);
  assert.equal(s2.prefs().mode, 'C');
  s2.record('Emaj7', 'Emaj7', 'correct');
  assert.deepEqual(s2.weakIds(), []);
  s2.reset();
  assert.equal(St.createStore(ls).get().total, 0);
  assert.equal(St.createStore(ls).prefs().mode, 'C', '清除紀錄保留偏好設定');
});

test('localStorage 無法使用或資料毀損時仍可練習', () => {
  const none = St.createStore(null);
  assert.equal(none.persistent, false);
  none.markSeen('C', 'C'); none.record('C', 'C', 'unsure');
  assert.equal(none.get().total, 1);
  assert.deepEqual(none.weakIds(), ['C']);

  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const t = St.createStore(throwing);
  t.markSeen('C', 'C'); t.record('C', 'C', 'correct');
  assert.equal(t.get().correct, 1);

  const ls = memoryStorage();
  ls.setItem(St.KEY, '{not json');
  assert.equal(St.createStore(ls).get().total, 0);
  ls.setItem(St.KEY, JSON.stringify({ total: -5, prefs: { mode: 'Z' }, chords: { x: 3 } }));
  const s = St.createStore(ls).get();
  assert.equal(s.total, 0); assert.equal(s.prefs.mode, 'A');
});
