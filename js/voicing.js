/*
 * voicing.js — 把和弦放到實際的八度上，並分配左右手與指法
 *
 * 規則：
 *  1. 和弦音以原位、由低至高（密集排列）放置，根音從中央 C 那個八度開始。
 *  2. 若整個和弦跨距在一個八度內 → 右手單手彈奏。
 *  3. 超過一個八度（九、十一、十三和弦等）→ 右手彈最上方、跨距不超過八度的音，
 *     其餘低音交給左手並降低一個八度（常見的「左手根音、右手上方結構」彈法）。
 *  4. 斜線和弦：右手彈和弦，左手獨立彈指定低音（低音譜號第 3 八度）。
 *
 * 間隔公式一律以「原位密集和弦音」計算，與左右手分配無關；斜線低音不列入。
 */
(function (root, factory) {
  var api;
  if (typeof module === 'object' && module.exports) {
    api = factory(require('./theory.js'), require('./fingering.js'));
    module.exports = api;
  } else {
    api = factory(root.PCL.theory, root.PCL.fingering);
    root.PCL.voicing = api;
  }
})(typeof self !== 'undefined' ? self : this, function (theory, fingering) {
  'use strict';

  var RH_MAX_SPAN = 12;   // 右手舒適跨距（半音）
  var RH_MAX_NOTES = 5;
  var MIDDLE_C_DIATONIC = 28; // C4

  function placeStack(chord, rootOctave) {
    var rootNote = theory.makeNote(chord.root.letter, chord.root.acc, rootOctave);
    return chord.tones.map(function (t) {
      var n = theory.transpose(rootNote, t.degree);
      return { letter: n.letter, acc: n.acc, octave: n.octave, degree: t.degree, degreeZh: t.degreeZh };
    });
  }

  /** 找出右手負責的最上方音群（由上往下取，跨距 ≤ 八度、最多 5 音） */
  function splitIndex(stack) {
    var top = theory.midi(stack[stack.length - 1]);
    var idx = stack.length - 1;
    while (idx - 1 >= 0 &&
           top - theory.midi(stack[idx - 1]) <= RH_MAX_SPAN &&
           stack.length - (idx - 1) <= RH_MAX_NOTES) {
      idx--;
    }
    return idx; // stack[idx..] 為右手
  }

  function decorate(n, hand, role) {
    var m = theory.midi(n);
    return {
      letter: n.letter, acc: n.acc, octave: n.octave,
      midi: m,
      name: theory.noteName(n),
      nameAscii: theory.noteName(n, 'ascii'),
      fullName: theory.noteNameWithOctave(n),
      degree: n.degree || null,
      degreeZh: n.degreeZh || null,
      hand: hand,           // 'R' | 'L'
      role: role,           // 'chord' | 'bass'
      black: fingering.isBlack(m),
      finger: null
    };
  }

  /**
   * @returns {{ rh: Array, lh: Array, split: boolean, stack: Array, all: Array, advice: string[] }}
   */
  function voice(chord) {
    // 先試根音在第 4 八度；需要分手時，選擇讓右手最低音仍在中央 C 以上的最低八度
    var rootOctave = 4;
    var stack = placeStack(chord, rootOctave);
    var spanSemis = theory.midi(stack[stack.length - 1]) - theory.midi(stack[0]);
    var split = !chord.isSlash && spanSemis > RH_MAX_SPAN;

    var rhNotes, lhNotes = [];
    if (split) {
      for (var o = 2; o <= 4; o++) {
        var st = placeStack(chord, o);
        var k = splitIndex(st);
        if (theory.diatonicIndex(st[k]) >= MIDDLE_C_DIATONIC) { rootOctave = o; stack = st; break; }
      }
      var si = splitIndex(stack);
      rhNotes = stack.slice(si).map(function (n) { return decorate(n, 'R', 'chord'); });
      lhNotes = stack.slice(0, si).map(function (n) {
        var low = { letter: n.letter, acc: n.acc, octave: n.octave - 1, degree: n.degree, degreeZh: n.degreeZh };
        return decorate(low, 'L', 'chord');
      });
    } else {
      rhNotes = stack.map(function (n) { return decorate(n, 'R', 'chord'); });
    }

    if (chord.isSlash) {
      var bassNote = { letter: chord.bass.letter, acc: chord.bass.acc, octave: 3, degree: null, degreeZh: '指定低音' };
      // 確保低音確實低於右手最低音
      while (theory.midi(bassNote) >= rhNotes[0].midi) bassNote.octave--;
      lhNotes = [decorate(bassNote, 'L', 'bass')];
    }

    var rf = fingering.rightHand(rhNotes.map(function (n) { return n.midi; }));
    rhNotes.forEach(function (n, i) { n.finger = rf[i]; });
    var lf = fingering.leftHand(lhNotes.map(function (n) { return n.midi; }));
    lhNotes.forEach(function (n, i) { n.finger = lf[i]; });

    var advice = [];
    if (chord.isSlash) {
      advice.push('斜線和弦：右手彈 ' + chord.symbol.split('/')[0] + ' 和弦，左手小指彈指定低音 ' + chord.bass.name + '。');
    } else if (split) {
      advice.push('此和弦跨距超過一個八度（' + spanSemis + ' 個半音），建議左右手分配：左手彈低音 ' +
        lhNotes.map(function (n) { return n.name; }).join('、') + '，右手彈上方 ' +
        rhNotes.map(function (n) { return n.name; }).join('、') + '。');
      advice.push('手掌較大者也可嘗試以右手單手彈奏原位密集排列。');
    }
    if (chord.type.note) advice.push(chord.type.note);
    advice.push('指法僅為建議，可依個人手型及前後和弦的連接調整。');

    var all = lhNotes.concat(rhNotes).sort(function (a, b) { return a.midi - b.midi; });

    return {
      rh: rhNotes,
      lh: lhNotes,
      split: split,
      rootOctave: rootOctave,
      stackMidis: stack.map(theory.midi),
      all: all,
      advice: advice
    };
  }

  return { voice: voice, RH_MAX_SPAN: RH_MAX_SPAN };
});
