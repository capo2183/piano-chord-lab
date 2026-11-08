'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theory.js');
const V = require('../js/voicing.js');
const F = require('../js/fingering.js');
const S = require('../js/staff.js');
const K = require('../js/keyboard.js');
const Q = require('../js/quiz.js');

/** 所有可出題的和弦（含斜線和弦） */
function allChords() {
  const out = [];
  for (const root of Q.ROOTS) {
    for (const k of Object.keys(T.CHORD_TYPES)) out.push(T.buildChord({ root: T.parseNote(root), typeKey: k }));
    for (const [bt, ivs] of Object.entries(Q.SLASH_BASES)) {
      for (const iv of ivs) out.push(Q.buildWithBestSpelling(root, bt, iv));
    }
  }
  Q.PRESETS.forEach((p) => out.push(T.buildChord(p)));
  return out;
}
const CHORDS = allChords();
const sortNum = (a) => a.slice().sort((x, y) => x - y);

function staffMidi(info) {
  // 由五線譜位置（字母 + 八度）與臨時記號還原音高
  const octave = Math.floor(info.d / 7), letter = info.d % 7;
  return 12 * (octave + 1) + T.NATURAL_SEMIS[letter] + info.acc;
}

test('五線譜與鍵盤顯示完全相同的音高（所有和弦）', () => {
  for (const c of CHORDS) {
    const v = V.voice(c);
    const voiced = sortNum(v.all.map((n) => n.midi));
    const st = S.render(v);
    assert.deepEqual(sortNum(st.notes.map((n) => n.midi)), voiced, c.id + ' staff');
    assert.deepEqual(sortNum(st.notes.map(staffMidi)), voiced, c.id + ' staff position');
    const kb = K.render(v.all.map((n) => ({ midi: n.midi, name: n.name, finger: n.finger, hand: n.hand })));
    const lit = [...kb.svg.matchAll(/data-midi="(\d+)" data-on="1"/g)].map((m) => +m[1]);
    assert.deepEqual(sortNum(lit), voiced, c.id + ' keyboard');
    // SVG 中每個符頭也帶有相同 data-midi
    const heads = [...st.svg.matchAll(/class="note (?:rh|lh)" data-midi="(\d+)"/g)].map((m) => +m[1]);
    assert.deepEqual(sortNum(heads), voiced, c.id + ' staff svg');
  }
});

test('實際彈奏的音與和弦組成音一致（同音名、同順序）', () => {
  for (const c of CHORDS) {
    const v = V.voice(c);
    const chordNotes = v.all.filter((n) => n.role === 'chord');
    assert.deepEqual(chordNotes.map((n) => n.nameAscii), c.tones.map((t) => t.nameAscii), c.id);
    // 由低至高
    for (let i = 1; i < v.all.length; i++) assert.ok(v.all[i].midi > v.all[i - 1].midi, c.id + ' ascending');
  }
});

test('斜線和弦：右手彈和弦、左手只彈指定低音', () => {
  const c = T.buildChord('C#m7(-5)/F#');
  const v = V.voice(c);
  assert.deepEqual(v.rh.map((n) => n.fullName), ['C♯4', 'E4', 'G4', 'B4']);
  assert.deepEqual(v.lh.map((n) => n.fullName), ['F♯3']);
  assert.equal(v.lh[0].role, 'bass');
  assert.equal(v.lh[0].finger, 5);
  const st = S.render(v);
  assert.deepEqual(st.notes.filter((n) => n.clef === 'bass').map((n) => n.midi), [54]);
  assert.deepEqual(st.notes.filter((n) => n.clef === 'treble').map((n) => n.midi), [61, 64, 67, 71]);
  for (const ch of CHORDS.filter((x) => x.isSlash)) {
    const vv = V.voice(ch);
    assert.equal(vv.lh.length, 1, ch.id);
    assert.equal(vv.lh[0].nameAscii, ch.bass.nameAscii, ch.id);
    assert.ok(vv.lh[0].midi < vv.rh[0].midi, ch.id + ' 低音在右手下方');
  }
});

test('指定題目的實際音高', () => {
  const v1 = V.voice(T.buildChord('Emaj7'));
  assert.deepEqual(v1.rh.map((n) => n.fullName), ['E4', 'G♯4', 'B4', 'D♯5']);
  assert.deepEqual(v1.rh.map((n) => n.finger), [1, 2, 3, 5]);
  const v2 = V.voice(T.buildChord('C#m7(9)'));
  assert.deepEqual(v2.all.map((n) => n.nameAscii), ['C#', 'E', 'G#', 'B', 'D#']);
  assert.equal(v2.split, true);
});

test('右手範圍與指法合理', () => {
  for (const c of CHORDS) {
    const v = V.voice(c);
    const rh = v.rh.map((n) => n.midi);
    assert.ok(rh[rh.length - 1] - rh[0] <= 12, c.id + ' 右手跨距不超過八度');
    assert.ok(T.diatonicIndex(v.rh[0]) >= 28, c.id + ' 右手在中央 C 以上（高音譜表）');
    assert.ok(v.rh.length <= 5 && v.lh.length <= 5);
    const rf = v.rh.map((n) => n.finger);
    assert.equal(rf[0], 1, c.id + ' 右手最低音用拇指');
    for (let i = 1; i < rf.length; i++) assert.ok(rf[i] > rf[i - 1], c.id + ' 右手指法遞增');
    const lf = v.lh.map((n) => n.finger);
    if (lf.length) assert.equal(lf[0], 5, c.id + ' 左手最低音用小指');
    for (let i = 1; i < lf.length; i++) assert.ok(lf[i] < lf[i - 1], c.id + ' 左手指法遞減');
    if (v.lh.length) assert.ok(v.lh[v.lh.length - 1].midi - v.lh[0].midi <= 12, c.id + ' 左手跨距');
  }
});

test('指法依琴鍵分布而不同', () => {
  assert.deepEqual(F.rightHand([60, 64, 67]), [1, 3, 5]);           // C
  assert.deepEqual(F.rightHand([60, 64, 67, 71]), [1, 2, 3, 5]);    // Cmaj7
  assert.deepEqual(F.rightHand([60, 64, 67, 70]), [1, 2, 3, 5]);    // C7
  const c6 = F.rightHand([60, 64, 67, 69]);                         // C6：G、A 相鄰
  assert.equal(c6[3], 5); assert.equal(c6[2], 4);
  assert.deepEqual(F.rightHand([60, 62, 67]), [1, 2, 5]);           // Csus2
  assert.deepEqual(F.rightHand([60, 65, 67]), [1, 4, 5]);           // Csus4
  assert.deepEqual(F.rightHand([60, 62, 64, 65, 67]), [1, 2, 3, 4, 5]);
  assert.deepEqual(F.leftHand([48]), [5]);
  assert.deepEqual(F.leftHand([48, 52, 55]), [5, 3, 1]);
});

test('五線譜版面：二度錯位與臨時記號分欄', () => {
  // Csus2：C4、D4 相鄰二度 → D4 向右錯位
  const sus2 = S.layoutChord(V.voice(T.buildChord('Csus2')).rh, 'treble');
  assert.deepEqual(sus2.items.map((i) => i.displaced), [false, true, false]);
  // C4 需要一條加線
  assert.deepEqual(sus2.ledgers.map((l) => l.d), [28]);
  // C6：G、A 二度 → A 錯位
  const c6 = S.layoutChord(V.voice(T.buildChord('C6')).rh, 'treble');
  assert.deepEqual(c6.items.map((i) => i.displaced), [false, false, false, true]);
  // D#maj7：四個臨時記號，相近的分在不同欄
  const dm = S.layoutChord(V.voice(T.buildChord('D#maj7')).rh, 'treble');
  const cols = dm.items.map((i) => i.accCol);
  for (let a = 0; a < dm.items.length; a++) for (let b = a + 1; b < dm.items.length; b++) {
    if (cols[a] === cols[b]) assert.ok(Math.abs(dm.items[a].d - dm.items[b].d) >= 6);
  }
  // 上加線：B 和弦的 A#5 需要一條上加線
  const b7 = S.layoutChord(V.voice(T.buildChord('Bmaj7')).rh, 'treble');
  assert.deepEqual(b7.ledgers.map((l) => l.d), [40]);
});

test('有左手音時使用大譜表（低音譜號）', () => {
  const single = S.render(V.voice(T.buildChord('Emaj7')));
  assert.ok(!single.svg.includes('staff-bass'));
  const slash = S.render(V.voice(T.buildChord('C#m7(-5)/F#')));
  assert.ok(slash.svg.includes('staff-bass'));
});

test('鍵盤寬度適合手機（不需要橫向捲動）', () => {
  for (const c of CHORDS) {
    const v = V.voice(c);
    const kb = K.render(v.all.map((n) => ({ midi: n.midi, name: n.name, finger: n.finger, hand: n.hand })));
    assert.ok(kb.whiteCount <= 19, c.id + ' 白鍵數 ' + kb.whiteCount);
  }
});

test('鍵盤可隱藏音名與指法', () => {
  const v = V.voice(T.buildChord('Emaj7'));
  const notes = v.all.map((n) => ({ midi: n.midi, name: n.name, finger: n.finger, hand: n.hand }));
  const shown = K.render(notes).svg;
  assert.ok(shown.includes('kb-name') && shown.includes('finger-badge'));
  const hidden = K.render(notes, { showNames: false, showFingers: false }).svg;
  assert.ok(!hidden.includes('kb-name') && !hidden.includes('finger-badge'));
});
