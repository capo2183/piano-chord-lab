'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theory.js');
const Q = require('../js/quiz.js');

const names = (c) => c.tones.map((t) => t.nameAscii);

test('五個指定題目符合指定答案', () => {
  const expect = {
    'Emaj7': { tones: ['E', 'G#', 'B', 'D#'], gaps: '3－2－3', bass: null, type: 'maj7' },
    'D#m7': { tones: ['D#', 'F#', 'A#', 'C#'], gaps: '2－3－2', bass: null, type: 'm7' },
    'G#m7': { tones: ['G#', 'B', 'D#', 'F#'], gaps: '2－3－2', bass: null, type: 'm7' },
    'C#m7(9)': { tones: ['C#', 'E', 'G#', 'B', 'D#'], gaps: '2－3－2－3', bass: null, type: 'm9' },
    'C#m7(-5)/F#': { tones: ['C#', 'E', 'G', 'B'], gaps: '2－2－3', bass: 'F#', type: 'm7b5' }
  };
  for (const [sym, e] of Object.entries(expect)) {
    const c = T.buildChord(sym);
    assert.deepEqual(names(c), e.tones, sym);
    assert.equal(c.gapFormula, e.gaps, sym);
    assert.equal(c.typeKey, e.type, sym);
    assert.equal(c.bass ? c.bass.nameAscii : null, e.bass, sym);
  }
  assert.deepEqual(Q.PRESETS, Object.keys(expect));
});

test('需求表中的常用間隔公式', () => {
  const table = {
    maj: '3－2', m: '2－3', dim: '2－2', aug: '3－3', maj7: '3－2－3', m7: '2－3－2',
    '7': '3－2－2', m7b5: '2－2－3', dim7: '2－2－2', m9: '2－3－2－3'
  };
  for (const root of Q.ROOTS) {
    for (const [type, formula] of Object.entries(table)) {
      const c = T.buildChord({ root: T.parseNote(root), typeKey: type });
      assert.equal(c.gapFormula, formula, root + type);
    }
  }
  assert.deepEqual(T.buildChord('Cmaj7').gaps, [3, 2, 3]);
});

test('所有和弦類型 × 所有根音：拼寫、音高與間隔都由公式一致推得', () => {
  for (const root of Q.ROOTS) {
    const r = T.parseNote(root);
    const rootPc = T.pitchClass(r);
    for (const [key, type] of Object.entries(T.CHORD_TYPES)) {
      const c = T.buildChord({ root: r, typeKey: key });
      assert.equal(c.tones.length, type.intervals.length);
      c.tones.forEach((t, i) => {
        const iv = T.INTERVALS[type.intervals[i]];
        // 字母級數正確（三度音一定是根音字母 +2，不會用等音字母）
        assert.equal(t.letter, (r.letter + iv.steps) % 7, `${root}${key} 第 ${i} 音字母`);
        // 音高正確
        assert.equal(T.pitchClass(t), (rootPc + iv.semis) % 12, `${root}${key} 第 ${i} 音音高`);
        assert.ok(Math.abs(t.acc) <= 2, `${root}${key} 不應出現三重升降`);
      });
      // 間隔 = 相鄰半音差 - 1（黑白鍵都算）
      for (let i = 1; i < c.tones.length; i++) {
        assert.equal(c.gaps[i - 1], c.tones[i].semis - c.tones[i - 1].semis - 1);
        assert.ok(c.gaps[i - 1] >= 0);
      }
    }
  }
});

test('各類型 C 和弦的組成音', () => {
  const expect = {
    maj: 'C E G', m: 'C Eb G', dim: 'C Eb Gb', aug: 'C E G#', sus2: 'C D G', sus4: 'C F G',
    '7': 'C E G Bb', maj7: 'C E G B', m7: 'C Eb G Bb', mMaj7: 'C Eb G B', m7b5: 'C Eb Gb Bb',
    dim7: 'C Eb Gb Bbb', '7sus4': 'C F G Bb', '6': 'C E G A', m6: 'C Eb G A', add9: 'C E G D',
    madd9: 'C Eb G D', '9': 'C E G Bb D', maj9: 'C E G B D', m9: 'C Eb G Bb D',
    '11': 'C E G Bb D F', m11: 'C Eb G Bb D F', '13': 'C E G Bb D A'
  };
  assert.deepEqual(Object.keys(expect).sort(), Object.keys(T.CHORD_TYPES).sort(), '涵蓋所有需求的和弦類型');
  for (const [k, v] of Object.entries(expect)) {
    assert.equal(names(T.buildChord({ root: T.parseNote('C'), typeKey: k })).join(' '), v, k);
  }
});

test('升降記號與等音異名', () => {
  assert.deepEqual(names(T.buildChord('Db')), ['Db', 'F', 'Ab']);
  assert.deepEqual(names(T.buildChord('C#')), ['C#', 'E#', 'G#']);   // E# 而不是 F
  assert.deepEqual(names(T.buildChord('F#maj7')), ['F#', 'A#', 'C#', 'E#']);
  assert.deepEqual(names(T.buildChord('Gbmaj7')), ['Gb', 'Bb', 'Db', 'F']);
  assert.deepEqual(names(T.buildChord('Ebm')), ['Eb', 'Gb', 'Bb']);
  assert.deepEqual(names(T.buildChord('D#m')), ['D#', 'F#', 'A#']);
  assert.deepEqual(names(T.buildChord('Bdim7')), ['B', 'D', 'F', 'Ab']);
  assert.deepEqual(names(T.buildChord('Gbdim')), ['Gb', 'Bbb', 'Dbb']);
  assert.deepEqual(names(T.buildChord('G#aug')), ['G#', 'B#', 'D##']);
  assert.deepEqual(names(T.buildChord('Bbm7b5')), ['Bb', 'Db', 'Fb', 'Ab']);
  assert.deepEqual(names(T.buildChord('Absus2')), ['Ab', 'Bb', 'Eb']);
  // 音高相同但拼寫不同
  const a = T.buildChord('C#m7'), b = T.buildChord('Dbm7');
  assert.deepEqual(a.tones.map(T.pitchClass), b.tones.map(T.pitchClass));
  assert.notDeepEqual(names(a), names(b));
  assert.deepEqual(names(b), ['Db', 'Fb', 'Ab', 'Cb']);
  // 出題時：有重升降且等音拼寫較簡單 → 改用等音拼寫
  assert.equal(Q.buildWithBestSpelling('D#', 'maj', null).id, 'Eb');
  assert.equal(Q.buildWithBestSpelling('D#', 'm7', null).id, 'D#m7');
  assert.equal(Q.buildWithBestSpelling('A#', 'maj7', null).id, 'Bbmaj7');
});

test('顯示用音名使用 ♯ ♭ 符號', () => {
  assert.equal(T.buildChord('C#m7(-5)/F#').symbol, 'C♯m7♭5/F♯');
  assert.equal(T.buildChord('C#m7(-5)/F#').label, 'C♯m7(-5)/F♯');
  assert.equal(T.buildChord('Bbm7b5').symbol, 'B♭m7♭5');
  assert.equal(T.noteName(T.parseNote('F##')), 'F♯♯');
});

test('和弦代號解析與別名', () => {
  const cases = {
    'C#m7♭5/F#': ['m7b5', 'F#'], 'C♯m7(-5)/F♯': ['m7b5', 'F#'], 'Cø': ['m7b5', null], 'CΔ7': ['maj7', null],
    'CM7': ['maj7', null], 'C-7': ['m7', null], 'Cm(maj7)': ['mMaj7', null], 'C°7': ['dim7', null],
    'C+': ['aug', null], 'Csus': ['sus4', null], 'Cm7(9)': ['m9', null], 'Cm(add9)': ['madd9', null],
    'Bb13': ['13', null], 'Ebm11': ['m11', null], 'C/E': ['maj', 'E'], 'Am7/D': ['m7', 'D'], 'C7sus4': ['7sus4', null]
  };
  for (const [s, [type, bass]] of Object.entries(cases)) {
    const p = T.parseChordSymbol(s);
    assert.equal(p.typeKey, type, s);
    assert.equal(p.bass ? T.noteName(p.bass, 'ascii') : null, bass, s);
  }
  assert.throws(() => T.parseChordSymbol('H7'));
  assert.throws(() => T.parseChordSymbol('Cxyz'));
});

test('斜線和弦的低音不列入間隔公式', () => {
  const c = T.buildChord('C#m7b5/F#');
  assert.equal(c.isSlash, true);
  assert.equal(c.gapFormula, '2－2－3');
  assert.equal(c.tones.some((t) => t.nameAscii === 'F#'), false);
  const inv = T.buildChord('C/E');
  assert.equal(inv.gapFormula, '3－2');
});

test('keyGaps 以「中間隔幾個琴鍵」計算，不等於半音數', () => {
  assert.deepEqual(T.keyGaps([60, 64, 67, 71]), [3, 2, 3]);
  assert.deepEqual(T.keyGaps([60, 61]), [0]);
});

test('MIDI 與八度（Cb、B# 跨八度）', () => {
  assert.equal(T.midi(T.parseNote('C4')), 60);
  assert.equal(T.midi(T.parseNote('Cb4')), 59);
  assert.equal(T.midi(T.parseNote('B#3')), 60);
  assert.equal(T.midi(T.parseNote('A4')), 69);
});
