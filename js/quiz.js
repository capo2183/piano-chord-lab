/*
 * quiz.js — 練習模式與隨機出題
 */
(function (root, factory) {
  var api;
  if (typeof module === 'object' && module.exports) { api = factory(require('./theory.js')); module.exports = api; }
  else { api = factory(root.PCL.theory); root.PCL.quiz = api; }
})(typeof self !== 'undefined' ? self : this, function (theory) {
  'use strict';

  var PRESETS = ['Emaj7', 'D#m7', 'G#m7', 'C#m7(9)', 'C#m7(-5)/F#'];

  /* 12 個半音、含升降記號的根音寫法 */
  var ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  var ENHARMONIC = { 'C#': 'Db', 'Db': 'C#', 'D#': 'Eb', 'Eb': 'D#', 'F#': 'Gb', 'Gb': 'F#', 'G#': 'Ab', 'Ab': 'G#', 'A#': 'Bb', 'Bb': 'A#' };

  var BASIC = ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4'];
  var SEVENTH = ['7', 'maj7', 'm7', 'mMaj7', 'm7b5', 'dim7', '7sus4'];
  var EXTENDED = ['6', 'm6', 'add9', 'madd9', '9', 'maj9', 'm9', '11', 'm11', '13'];

  /* 斜線和弦：可用的基礎和弦，以及低音（相對根音的音程） */
  var SLASH_BASES = {
    maj: ['3', '5', '2', '4'], m: ['b3', '5', '4'], sus4: ['2'],
    '7': ['3', '5', 'b7'], maj7: ['3', '5', '2'], m7: ['b3', '5', '4', 'b7'], m7b5: ['4', 'b3']
  };

  var MODES = {
    A: { key: 'A', name: '指定和弦', desc: 'Emaj7、D♯m7、G♯m7、C♯m7(9)、C♯m7(-5)/F♯', presets: PRESETS },
    B: { key: 'B', name: '基礎練習', desc: 'Major、Minor、dim、aug、sus2、sus4', types: BASIC },
    C: { key: 'C', name: '七和弦', desc: '7、maj7、m7、m(maj7)、m7♭5、dim7、7sus4', types: SEVENTH },
    D: { key: 'D', name: '進階練習', desc: '6、add9、九、十一、十三和弦與斜線和弦', types: EXTENDED, slashRate: 0.15 },
    E: { key: 'E', name: '全部隨機', desc: '所有支援的和弦（含斜線和弦）', types: BASIC.concat(SEVENTH, EXTENDED), slashRate: 0.12 }
  };

  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

  function noteFromName(name) { var n = theory.parseNote(name); return theory.makeNote(n.letter, n.acc); }

  /** 依根音寫法建立和弦；若出現重升降而等音寫法較簡單，改用等音寫法 */
  function buildWithBestSpelling(rootName, typeKey, bassInterval) {
    function make(rn) {
      var r = noteFromName(rn);
      var bass = null;
      if (bassInterval) bass = theory.transpose(r, bassInterval);
      return theory.buildChord({ root: r, typeKey: typeKey, bass: bass ? theory.makeNote(bass.letter, bass.acc) : null });
    }
    var c = make(rootName);
    var alt = ENHARMONIC[rootName];
    if (alt && theory.doubleAccidentalCount(c) > 0) {
      var c2 = make(alt);
      if (theory.doubleAccidentalCount(c2) < theory.doubleAccidentalCount(c)) c = c2;
    }
    return c;
  }

  var presetChords = null;
  function getPresetChords() {
    if (!presetChords) presetChords = PRESETS.map(function (p) { return theory.buildChord(p); });
    return presetChords;
  }

  /** 某個和弦 id 是否屬於該模式 */
  function idInMode(id, modeKey) {
    var mode = MODES[modeKey];
    if (mode.presets) return getPresetChords().some(function (c) { return c.id === id; });
    var p;
    try { p = theory.parseChordSymbol(id); } catch (e) { return false; }
    if (p.bass) return !!mode.slashRate && !!SLASH_BASES[p.typeKey];
    return mode.types.indexOf(p.typeKey) >= 0;
  }

  function chordFromId(id) {
    var presets = getPresetChords();
    for (var i = 0; i < presets.length; i++) if (presets[i].id === id) return theory.buildChord(PRESETS[i]);
    return theory.buildChord(id);
  }

  function randomChord(modeKey, rng) {
    var mode = MODES[modeKey];
    if (mode.presets) return theory.buildChord(pick(PRESETS, rng));
    if (mode.slashRate && rng() < mode.slashRate) {
      var baseKeys = Object.keys(SLASH_BASES);
      var bt = pick(baseKeys, rng);
      return buildWithBestSpelling(pick(ROOTS, rng), bt, pick(SLASH_BASES[bt], rng));
    }
    return buildWithBestSpelling(pick(ROOTS, rng), pick(mode.types, rng), null);
  }

  /**
   * 產生下一題
   * @param {object} o { mode, prevId, weakIds, rng, weakRate }
   */
  function nextChord(o) {
    var rng = o.rng || Math.random;
    var weakRate = o.weakRate === undefined ? 0.35 : o.weakRate;
    var weak = (o.weakIds || []).filter(function (id) { return id !== o.prevId && idInMode(id, o.mode); });
    if (weak.length && rng() < weakRate) {
      var c = chordFromId(pick(weak, rng));
      c.fromReview = true;
      return c;
    }
    var chord;
    for (var i = 0; i < 50; i++) {
      chord = randomChord(o.mode, rng);
      if (chord.id !== o.prevId) break;
    }
    return chord;
  }

  return {
    PRESETS: PRESETS,
    ROOTS: ROOTS,
    MODES: MODES,
    SLASH_BASES: SLASH_BASES,
    TYPE_GROUPS: { BASIC: BASIC, SEVENTH: SEVENTH, EXTENDED: EXTENDED },
    getPresetChords: getPresetChords,
    buildWithBestSpelling: buildWithBestSpelling,
    idInMode: idInMode,
    nextChord: nextChord
  };
});
