/*
 * theory.js — 樂理核心：音名拼寫、音程、和弦公式、和弦代號解析、琴鍵間隔計算
 *
 * 所有和弦音都由「根音 + 音程公式」以「字母級數 + 半音數」計算，
 * 因此可以得到正確的升降拼寫（例如 D#maj7 的三音是 F𝄪 而不是 G）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PCL = root.PCL || {}; root.PCL.theory = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var NATURAL_SEMIS = [0, 2, 4, 5, 7, 9, 11];

  /* 音程：steps = 字母級數差（度數 - 1），semis = 半音數 */
  var INTERVALS = {
    '1':   { steps: 0,  semis: 0,  zh: '根音' },
    '2':   { steps: 1,  semis: 2,  zh: '大二度' },
    'b3':  { steps: 2,  semis: 3,  zh: '小三度' },
    '3':   { steps: 2,  semis: 4,  zh: '大三度' },
    '4':   { steps: 3,  semis: 5,  zh: '純四度' },
    'b5':  { steps: 4,  semis: 6,  zh: '減五度' },
    '5':   { steps: 4,  semis: 7,  zh: '純五度' },
    '#5':  { steps: 4,  semis: 8,  zh: '增五度' },
    '6':   { steps: 5,  semis: 9,  zh: '大六度' },
    'bb7': { steps: 6,  semis: 9,  zh: '減七度' },
    'b7':  { steps: 6,  semis: 10, zh: '小七度' },
    '7':   { steps: 6,  semis: 11, zh: '大七度' },
    '9':   { steps: 8,  semis: 14, zh: '大九度' },
    '11':  { steps: 10, semis: 17, zh: '純十一度' },
    '13':  { steps: 12, semis: 21, zh: '大十三度' }
  };

  /* 和弦類型。intervals 依「原位、由低至高」排列（延伸音放在七音之上）。 */
  var CHORD_TYPES = {
    maj:   { symbol: '',        zh: '大三和弦',     en: 'Major',              group: 'basic',   intervals: ['1', '3', '5'] },
    m:     { symbol: 'm',       zh: '小三和弦',     en: 'Minor',              group: 'basic',   intervals: ['1', 'b3', '5'] },
    dim:   { symbol: 'dim',     zh: '減三和弦',     en: 'Diminished',         group: 'basic',   intervals: ['1', 'b3', 'b5'] },
    aug:   { symbol: 'aug',     zh: '增三和弦',     en: 'Augmented',          group: 'basic',   intervals: ['1', '3', '#5'] },
    sus2:  { symbol: 'sus2',    zh: '掛二和弦',     en: 'Suspended 2nd',      group: 'basic',   intervals: ['1', '2', '5'] },
    sus4:  { symbol: 'sus4',    zh: '掛四和弦',     en: 'Suspended 4th',      group: 'basic',   intervals: ['1', '4', '5'] },
    '7':   { symbol: '7',       zh: '屬七和弦',     en: 'Dominant 7th',       group: 'seventh', intervals: ['1', '3', '5', 'b7'] },
    maj7:  { symbol: 'maj7',    zh: '大七和弦',     en: 'Major 7th',          group: 'seventh', intervals: ['1', '3', '5', '7'] },
    m7:    { symbol: 'm7',      zh: '小七和弦',     en: 'Minor 7th',          group: 'seventh', intervals: ['1', 'b3', '5', 'b7'] },
    mMaj7: { symbol: 'm(maj7)', zh: '小大七和弦',   en: 'Minor-Major 7th',    group: 'seventh', intervals: ['1', 'b3', '5', '7'] },
    m7b5:  { symbol: 'm7b5',    zh: '半減七和弦',   en: 'Half-diminished 7th', group: 'seventh', intervals: ['1', 'b3', 'b5', 'b7'] },
    dim7:  { symbol: 'dim7',    zh: '減七和弦',     en: 'Diminished 7th',     group: 'seventh', intervals: ['1', 'b3', 'b5', 'bb7'] },
    '7sus4': { symbol: '7sus4', zh: '屬七掛四和弦', en: 'Dominant 7th sus4',  group: 'seventh', intervals: ['1', '4', '5', 'b7'] },
    '6':   { symbol: '6',       zh: '大六和弦',     en: 'Major 6th',          group: 'extended', intervals: ['1', '3', '5', '6'] },
    m6:    { symbol: 'm6',      zh: '小六和弦',     en: 'Minor 6th',          group: 'extended', intervals: ['1', 'b3', '5', '6'] },
    add9:  { symbol: 'add9',    zh: '加九和弦',     en: 'Added 9th',          group: 'extended', intervals: ['1', '3', '5', '9'] },
    madd9: { symbol: 'm(add9)', zh: '小加九和弦',   en: 'Minor added 9th',    group: 'extended', intervals: ['1', 'b3', '5', '9'] },
    '9':   { symbol: '9',       zh: '屬九和弦',     en: 'Dominant 9th',       group: 'extended', intervals: ['1', '3', '5', 'b7', '9'] },
    maj9:  { symbol: 'maj9',    zh: '大九和弦',     en: 'Major 9th',          group: 'extended', intervals: ['1', '3', '5', '7', '9'] },
    m9:    { symbol: 'm9',      zh: '小九和弦',     en: 'Minor 9th',          group: 'extended', intervals: ['1', 'b3', '5', 'b7', '9'] },
    '11':  { symbol: '11',      zh: '屬十一和弦',   en: 'Dominant 11th',      group: 'extended', intervals: ['1', '3', '5', 'b7', '9', '11'] },
    m11:   { symbol: 'm11',     zh: '小十一和弦',   en: 'Minor 11th',         group: 'extended', intervals: ['1', 'b3', '5', 'b7', '9', '11'] },
    '13':  { symbol: '13',      zh: '屬十三和弦',   en: 'Dominant 13th',      group: 'extended', intervals: ['1', '3', '5', 'b7', '9', '13'],
             note: '依爵士/流行慣例，屬十三和弦通常省略 11 度音（避免與 3 度音衝突）。' }
  };

  /* 和弦代號別名（已將 ♭→b、♯→#、Δ→maj、空白移除） */
  var QUALITY_ALIASES = {
    '': 'maj', 'M': 'maj', 'maj': 'maj', 'major': 'maj',
    'm': 'm', 'min': 'm', '-': 'm', 'minor': 'm',
    'dim': 'dim', '°': 'dim', 'o': 'dim',
    'aug': 'aug', '+': 'aug', '(#5)': 'aug',
    'sus2': 'sus2', 'sus4': 'sus4', 'sus': 'sus4',
    '7': '7', 'dom7': '7',
    'maj7': 'maj7', 'M7': 'maj7', 'ma7': 'maj7',
    'm7': 'm7', 'min7': 'm7', '-7': 'm7',
    'm(maj7)': 'mMaj7', 'mmaj7': 'mMaj7', 'mMaj7': 'mMaj7', 'mM7': 'mMaj7', 'm(M7)': 'mMaj7', 'minmaj7': 'mMaj7', '-maj7': 'mMaj7',
    'm7b5': 'm7b5', 'm7(b5)': 'm7b5', 'm7(-5)': 'm7b5', 'm7-5': 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', 'min7b5': 'm7b5',
    'dim7': 'dim7', '°7': 'dim7', 'o7': 'dim7',
    '7sus4': '7sus4', '7sus': '7sus4',
    '6': '6', 'maj6': '6', 'M6': '6',
    'm6': 'm6', 'min6': 'm6', '-6': 'm6',
    'add9': 'add9', '(add9)': 'add9', 'add2': 'add9',
    'madd9': 'madd9', 'm(add9)': 'madd9', 'madd2': 'madd9',
    '9': '9', '7(9)': '9',
    'maj9': 'maj9', 'M9': 'maj9', 'maj7(9)': 'maj9', 'M7(9)': 'maj9',
    'm9': 'm9', 'min9': 'm9', 'm7(9)': 'm9', '-9': 'm9',
    '11': '11', '9(11)': '11',
    'm11': 'm11', 'min11': 'm11', 'm9(11)': 'm11', '-11': 'm11',
    '13': '13', '9(13)': '13', '7(9,13)': '13'
  };

  /* ---------- 音符 ---------- */

  /** note = { letter: 0-6, acc: -2..2, octave?: number } */
  function makeNote(letter, acc, octave) {
    var n = { letter: letter, acc: acc };
    if (typeof octave === 'number') n.octave = octave;
    return n;
  }

  function accFromString(s) {
    switch (s || '') {
      case '': return 0;
      case '#': return 1;
      case '##': case 'x': return 2;
      case 'b': return -1;
      case 'bb': return -2;
      default: return null;
    }
  }

  function normalizeSymbol(s) {
    return String(s)
      .replace(/[♯＃]/g, '#')
      .replace(/♭/g, 'b')
      .replace(/𝄪/g, '##')
      .replace(/𝄫/g, 'bb')
      .replace(/Δ/g, 'maj')
      .replace(/\s+/g, '');
  }

  /** "C#" / "Bb" / "F##" / "C#4" → note */
  function parseNote(str) {
    var m = /^([A-Ga-g])(##|bb|x|#|b)?(-?\d+)?$/.exec(normalizeSymbol(str));
    if (!m) throw new Error('無法解析音名：' + str);
    var letter = LETTERS.indexOf(m[1].toUpperCase());
    return makeNote(letter, accFromString(m[2]), m[3] !== undefined ? parseInt(m[3], 10) : undefined);
  }

  function pitchClass(n) {
    return (((NATURAL_SEMIS[n.letter] + n.acc) % 12) + 12) % 12;
  }

  /** MIDI 音高（C4 = 60）。八度以字母為準（科學音高記號），Cb4 = 59、B#3 = 60。 */
  function midi(n) {
    return 12 * (n.octave + 1) + NATURAL_SEMIS[n.letter] + n.acc;
  }

  /** 五線譜用的「全音階位置」：octave*7 + letter（C4 = 28） */
  function diatonicIndex(n) {
    return n.octave * 7 + n.letter;
  }

  function accText(acc, style) {
    if (style === 'ascii') return acc > 0 ? new Array(acc + 1).join('#') : new Array(-acc + 1).join('b');
    if (acc === 2) return '♯♯';
    if (acc === -2) return '♭♭';
    if (acc === 1) return '♯';
    if (acc === -1) return '♭';
    return '';
  }

  /** 顯示用音名；style: 'unicode'（預設）或 'ascii' */
  function noteName(n, style) {
    return LETTERS[n.letter] + accText(n.acc, style);
  }

  function noteNameWithOctave(n, style) {
    return noteName(n, style) + n.octave;
  }

  /** 依音程（字母級數 + 半音）向上移調，得到正確拼寫 */
  function transpose(n, intervalName) {
    var iv = INTERVALS[intervalName];
    if (!iv) throw new Error('未知音程：' + intervalName);
    var oct = typeof n.octave === 'number' ? n.octave : 4;
    var letterTotal = n.letter + iv.steps;
    var newLetter = letterTotal % 7;
    var newOct = oct + Math.floor(letterTotal / 7);
    var startMidi = 12 * (oct + 1) + NATURAL_SEMIS[n.letter] + n.acc;
    var targetMidi = startMidi + iv.semis;
    var naturalMidi = 12 * (newOct + 1) + NATURAL_SEMIS[newLetter];
    var res = makeNote(newLetter, targetMidi - naturalMidi);
    if (typeof n.octave === 'number') res.octave = newOct;
    return res;
  }

  /** 兩個（有八度的）音之間的音程中文名稱 */
  var INTERVAL_NAMES_BY_STEPS = {
    0: { 0: '同度', 1: '增一度' },
    1: { 1: '小二度', 2: '大二度', 3: '增二度' },
    2: { 2: '減三度', 3: '小三度', 4: '大三度', 5: '增三度' },
    3: { 4: '減四度', 5: '純四度', 6: '增四度' },
    4: { 6: '減五度', 7: '純五度', 8: '增五度' },
    5: { 8: '小六度', 9: '大六度', 10: '增六度' },
    6: { 9: '減七度', 10: '小七度', 11: '大七度' }
  };
  function intervalBetween(a, b) {
    var steps = diatonicIndex(b) - diatonicIndex(a);
    var semis = midi(b) - midi(a);
    var simpleSteps = steps % 7;
    var simpleSemis = semis - 12 * Math.floor(steps / 7);
    var table = INTERVAL_NAMES_BY_STEPS[simpleSteps] || {};
    var zh = table[simpleSemis] || (steps + 1) + ' 度';
    if (steps >= 7 && table[simpleSemis]) zh = '複' + zh; // 超過八度
    return { steps: steps, semis: semis, zh: zh };
  }

  /* ---------- 琴鍵間隔（本站核心記憶法） ---------- */

  /** 相鄰兩個要按的琴鍵之間隔了幾個琴鍵（黑白鍵都算）＝ 半音差 - 1 */
  function keyGaps(midis) {
    var gaps = [];
    for (var i = 1; i < midis.length; i++) gaps.push(midis[i] - midis[i - 1] - 1);
    return gaps;
  }

  function formatGaps(gaps) {
    return gaps.join('－');
  }

  /* ---------- 和弦 ---------- */

  function parseChordSymbol(symbol) {
    var s = normalizeSymbol(symbol);
    var bass = null;
    var slash = s.lastIndexOf('/');
    if (slash > 0) {
      bass = parseNote(s.slice(slash + 1));
      s = s.slice(0, slash);
    }
    var m = /^([A-G])(##|bb|#|b)?(.*)$/.exec(s);
    if (!m) throw new Error('無法解析和弦代號：' + symbol);
    var quality = m[3];
    var typeKey = QUALITY_ALIASES[quality];
    if (!typeKey && QUALITY_ALIASES.hasOwnProperty(quality.toLowerCase())) typeKey = QUALITY_ALIASES[quality.toLowerCase()];
    if (!typeKey) throw new Error('不支援的和弦類型：' + symbol);
    return {
      root: makeNote(LETTERS.indexOf(m[1]), accFromString(m[2])),
      typeKey: typeKey,
      bass: bass ? makeNote(bass.letter, bass.acc) : null
    };
  }

  function canonicalSymbol(rootNote, typeKey, bassNote, style) {
    var t = CHORD_TYPES[typeKey];
    var sym = t.symbol;
    if (style !== 'ascii') sym = sym.replace(/b/g, '♭').replace(/#/g, '♯');
    var s = noteName(rootNote, style) + sym;
    if (bassNote) s += '/' + noteName(bassNote, style);
    return s;
  }

  /** 將使用者輸入的代號轉為好看的顯示字串（保留原寫法，只替換升降記號） */
  function prettySymbol(symbol) {
    return normalizeSymbol(symbol).replace(/#/g, '♯').replace(/([A-G]|\d|m)b/g, '$1♭').replace(/([A-G]|\d|m)b/g, '$1♭');
  }

  /**
   * 建立和弦物件。
   * @param {object|string} spec  和弦代號字串，或 { root, typeKey, bass, label }
   */
  function buildChord(spec) {
    var parsed;
    var label = null;
    if (typeof spec === 'string') { parsed = parseChordSymbol(spec); label = spec; }
    else { parsed = { root: spec.root, typeKey: spec.typeKey, bass: spec.bass || null }; label = spec.label || null; }

    var type = CHORD_TYPES[parsed.typeKey];
    if (!type) throw new Error('未知和弦類型：' + parsed.typeKey);
    var rootNote = makeNote(parsed.root.letter, parsed.root.acc, 4);

    var tones = type.intervals.map(function (ivName) {
      var n = transpose(rootNote, ivName);
      var iv = INTERVALS[ivName];
      return {
        degree: ivName,
        degreeZh: iv.zh,
        semis: iv.semis,
        steps: iv.steps,
        letter: n.letter,
        acc: n.acc,
        name: noteName(n),
        nameAscii: noteName(n, 'ascii')
      };
    });

    var bass = parsed.bass ? {
      letter: parsed.bass.letter, acc: parsed.bass.acc,
      name: noteName(parsed.bass), nameAscii: noteName(parsed.bass, 'ascii')
    } : null;

    var id = canonicalSymbol(parsed.root, parsed.typeKey, parsed.bass, 'ascii');
    var display = canonicalSymbol(parsed.root, parsed.typeKey, parsed.bass);
    var rootDisplay = noteName(parsed.root);

    var gaps = keyGaps(tones.map(function (t) { return t.semis; }));

    return {
      id: id,
      symbol: display,                                 // 標準寫法，例如 C♯m7♭5/F♯
      label: label ? prettySymbol(label) : display,    // 題目顯示（保留原本寫法）
      root: makeNote(parsed.root.letter, parsed.root.acc),
      rootName: rootDisplay,
      typeKey: parsed.typeKey,
      type: type,
      tones: tones,
      bass: bass,
      isSlash: !!bass,
      gaps: gaps,
      gapFormula: formatGaps(gaps),
      zhName: rootDisplay + ' ' + type.zh + (bass ? '／低音 ' + bass.name : ''),
      enName: rootDisplay + ' ' + type.en + (bass ? ' over ' + bass.name : '')
    };
  }

  /** 和弦中重升／重降記號的數量（題目產生器用來挑選較常用的等音拼寫） */
  function doubleAccidentalCount(chord) {
    var c = 0;
    chord.tones.forEach(function (t) { if (Math.abs(t.acc) >= 2) c++; });
    if (chord.bass && Math.abs(chord.bass.acc) >= 2) c++;
    return c;
  }

  return {
    LETTERS: LETTERS,
    NATURAL_SEMIS: NATURAL_SEMIS,
    INTERVALS: INTERVALS,
    CHORD_TYPES: CHORD_TYPES,
    QUALITY_ALIASES: QUALITY_ALIASES,
    makeNote: makeNote,
    parseNote: parseNote,
    pitchClass: pitchClass,
    midi: midi,
    diatonicIndex: diatonicIndex,
    noteName: noteName,
    noteNameWithOctave: noteNameWithOctave,
    accText: accText,
    transpose: transpose,
    intervalBetween: intervalBetween,
    keyGaps: keyGaps,
    formatGaps: formatGaps,
    normalizeSymbol: normalizeSymbol,
    parseChordSymbol: parseChordSymbol,
    canonicalSymbol: canonicalSymbol,
    prettySymbol: prettySymbol,
    buildChord: buildChord,
    doubleAccidentalCount: doubleAccidentalCount
  };
});
