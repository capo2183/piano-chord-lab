/*
 * storage.js — 練習紀錄（localStorage）。無法使用時自動改用記憶體，不影響練習。
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PCL = root.PCL || {}; root.PCL.storage = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var KEY = 'pianoChordLab.v1';
  var HISTORY_MAX = 100;

  function defaultState() {
    return {
      version: 1,
      total: 0,        // 累計看過的題數
      correct: 0,
      unsure: 0,
      chords: {},      // id → { seen, correct, unsure, last, label }
      history: [],     // { id, label, result, t }
      prefs: { mode: 'A', showNames: true, showGaps: true, showFingers: true }
    };
  }

  function getBackend(explicit) {
    if (explicit !== undefined) return explicit;
    try {
      var ls = root && root.localStorage;
      if (!ls) return null;
      var t = '__pcl_test__';
      ls.setItem(t, t); ls.removeItem(t);
      return ls;
    } catch (e) { return null; }
  }

  function sanitize(raw) {
    var d = defaultState();
    if (!raw || typeof raw !== 'object') return d;
    ['total', 'correct', 'unsure'].forEach(function (k) {
      if (typeof raw[k] === 'number' && isFinite(raw[k]) && raw[k] >= 0) d[k] = raw[k];
    });
    if (raw.chords && typeof raw.chords === 'object') {
      Object.keys(raw.chords).forEach(function (id) {
        var c = raw.chords[id];
        if (c && typeof c === 'object') {
          d.chords[id] = {
            seen: +c.seen || 0, correct: +c.correct || 0, unsure: +c.unsure || 0,
            last: c.last === 'correct' || c.last === 'unsure' ? c.last : null,
            label: typeof c.label === 'string' ? c.label : id
          };
        }
      });
    }
    if (Array.isArray(raw.history)) d.history = raw.history.filter(function (h) { return h && typeof h.id === 'string'; }).slice(-HISTORY_MAX);
    if (raw.prefs && typeof raw.prefs === 'object') {
      if (/^[A-E]$/.test(raw.prefs.mode)) d.prefs.mode = raw.prefs.mode;
      ['showNames', 'showGaps', 'showFingers'].forEach(function (k) {
        if (typeof raw.prefs[k] === 'boolean') d.prefs[k] = raw.prefs[k];
      });
    }
    return d;
  }

  /**
   * @param {Storage|null} [backend] 測試時可注入；null 代表停用 localStorage
   */
  function createStore(backend) {
    var ls = getBackend(backend);
    var state;
    try { state = sanitize(ls ? JSON.parse(ls.getItem(KEY) || 'null') : null); }
    catch (e) { state = defaultState(); }

    function save() {
      if (!ls) return false;
      try { ls.setItem(KEY, JSON.stringify(state)); return true; }
      catch (e) { return false; }
    }

    function chordEntry(id, label) {
      if (!state.chords[id]) state.chords[id] = { seen: 0, correct: 0, unsure: 0, last: null, label: label || id };
      if (label) state.chords[id].label = label;
      return state.chords[id];
    }

    return {
      persistent: !!ls,
      get: function () { return state; },
      prefs: function () { return state.prefs; },
      setPref: function (k, v) { state.prefs[k] = v; save(); },
      markSeen: function (id, label) {
        state.total++;
        chordEntry(id, label).seen++;
        save();
      },
      record: function (id, label, result) {
        var e = chordEntry(id, label);
        if (result === 'correct') { e.correct++; state.correct++; }
        else { e.unsure++; state.unsure++; }
        e.last = result;
        state.history.push({ id: id, label: label, result: result, t: Date.now() });
        if (state.history.length > HISTORY_MAX) state.history = state.history.slice(-HISTORY_MAX);
        save();
      },
      /** 標記為不熟、且尚未「最後一次答對」的和弦 */
      weakIds: function () {
        return Object.keys(state.chords).filter(function (id) {
          var c = state.chords[id];
          return c.last === 'unsure' || (c.unsure > c.correct && c.last !== 'correct');
        });
      },
      reset: function () {
        var prefs = state.prefs;
        state = defaultState();
        state.prefs = prefs;
        save();
      }
    };
  }

  return { createStore: createStore, KEY: KEY, sanitize: sanitize };
});
