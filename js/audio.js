/*
 * audio.js — 以 Web Audio API 合成近似鋼琴的音色（只在使用者點擊時播放）
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PCL = root.PCL || {}; root.PCL.audio = api; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var ctx = null, master = null;

  function isSupported() {
    return !!(root && (root.AudioContext || root.webkitAudioContext));
  }

  function getContext() {
    if (!isSupported()) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /* 加法合成：基音 + 泛音，各自以不同速度衰減，加上低通濾波模擬琴槌 */
  var PARTIALS = [
    { mult: 1, amp: 1.0, type: 'triangle' },
    { mult: 2, amp: 0.42, type: 'sine' },
    { mult: 3, amp: 0.18, type: 'sine' },
    { mult: 4, amp: 0.09, type: 'sine' },
    { mult: 5.02, amp: 0.04, type: 'sine' }
  ];

  function playNote(midi, when, velocity) {
    var c = ctx;
    var hz = freq(midi);
    var dur = Math.max(1.2, 4.2 - (midi - 48) * 0.05); // 高音衰減較快
    var noteGain = c.createGain();
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, hz * 9), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, hz * 2.2), when + dur * 0.6);
    filter.Q.value = 0.6;
    var peak = 0.22 * (velocity || 1);
    noteGain.gain.setValueAtTime(0.0001, when);
    noteGain.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    noteGain.gain.exponentialRampToValueAtTime(peak * 0.35, when + 0.25);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    noteGain.connect(filter); filter.connect(master);

    PARTIALS.forEach(function (p, i) {
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = p.type;
      osc.frequency.value = hz * p.mult;
      osc.detune.value = (i % 2 ? 1 : -1) * 2;
      g.gain.setValueAtTime(p.amp, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, p.amp * 0.05), when + dur / (1 + i * 0.8));
      osc.connect(g); g.connect(noteGain);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    });
  }

  /**
   * @param {number[]} midis  由低到高
   * @param {{ arpeggio?: boolean }} opts
   * @returns {boolean} 是否成功播放
   */
  function playChord(midis, opts) {
    opts = opts || {};
    var c = getContext();
    if (!c) return false;
    var now = c.currentTime + 0.03;
    var step = opts.arpeggio ? 0.32 : 0.018; // 和弦也略微滾奏，較自然
    var vel = Math.min(1, 3 / Math.sqrt(midis.length * 2));
    midis.forEach(function (m, i) { playNote(m, now + i * step, vel); });
    return true;
  }

  return { isSupported: isSupported, playChord: playChord, freq: freq };
});
