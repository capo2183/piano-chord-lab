/*
 * app.js — 介面控制：出題、揭曉、紀錄、設定
 *
 * 重要：揭曉前答案區完全不產生任何音符、指法相關的 DOM，避免提前洩漏答案。
 */
(function () {
  'use strict';
  var PCL = window.PCL;
  var theory = PCL.theory, voicing = PCL.voicing, staff = PCL.staff, keyboard = PCL.keyboard,
      audio = PCL.audio, quiz = PCL.quiz, fingering = PCL.fingering;

  var store = PCL.storage.createStore();
  var prefs = store.prefs();

  var state = {
    mode: prefs.mode || 'A',
    chord: null,
    voicing: null,
    revealed: false,
    sessionCount: 0
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    modeList: $('mode-list'), modeDesc: $('mode-desc'),
    card: $('question-card'), symbol: $('q-symbol'), index: $('q-index'), review: $('q-review'), hint: $('question-hint'),
    answer: $('answer'),
    actionsQ: $('actions-question'), actionsA: $('actions-answer'),
    statSession: $('stat-session'), statTotal: $('stat-total'), statAcc: $('stat-acc'),
    optNames: $('opt-names'), optGaps: $('opt-gaps'), optFingers: $('opt-fingers'),
    storageStatus: $('storage-status'), weakList: $('weak-list'), historyList: $('history-list')
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ---------- 模式 ---------- */

  function renderModes() {
    el.modeList.innerHTML = Object.keys(quiz.MODES).map(function (k) {
      var m = quiz.MODES[k];
      var on = k === state.mode;
      return '<button type="button" role="radio" class="mode-chip' + (on ? ' active' : '') + '" data-mode="' + k +
        '" aria-checked="' + on + '"><span class="mode-key">' + k + '</span>' + esc(m.name) + '</button>';
    }).join('');
    el.modeDesc.textContent = quiz.MODES[state.mode].desc;
  }

  el.modeList.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === state.mode) return;
    state.mode = b.dataset.mode;
    store.setPref('mode', state.mode);
    renderModes();
    nextQuestion();
  });

  /* ---------- 出題 ---------- */

  function nextQuestion() {
    var prevId = state.chord ? state.chord.id : null;
    state.chord = quiz.nextChord({ mode: state.mode, prevId: prevId, weakIds: store.weakIds() });
    state.voicing = null;
    state.revealed = false;
    state.sessionCount++;
    store.markSeen(state.chord.id, state.chord.label);

    el.symbol.textContent = state.chord.label;
    el.symbol.setAttribute('aria-label', '題目：' + state.chord.label);
    el.index.textContent = '第 ' + state.sessionCount + ' 題';
    el.review.hidden = !state.chord.fromReview;
    el.hint.textContent = '先在鋼琴上找出組成音，再點一下揭曉答案';
    el.card.classList.remove('revealed');
    el.card.setAttribute('aria-expanded', 'false');
    el.card.setAttribute('aria-label', '題目 ' + state.chord.label + '，點一下顯示答案');
    el.answer.innerHTML = '';            // 揭曉前不留任何答案內容
    el.answer.classList.remove('show');
    el.actionsQ.hidden = false;
    el.actionsA.hidden = true;
    updateStats();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function reveal() {
    if (state.revealed) return;
    state.revealed = true;
    state.voicing = voicing.voice(state.chord);
    el.card.classList.add('revealed');
    el.card.setAttribute('aria-expanded', 'true');
    el.card.setAttribute('aria-label', '題目 ' + state.chord.label + '，答案已顯示');
    el.hint.textContent = state.chord.zhName;
    el.actionsQ.hidden = true;
    el.actionsA.hidden = false;
    renderAnswer();
    el.answer.classList.add('show');
  }

  /* ---------- 答案 ---------- */

  function gapsHtml(chord, show) {
    if (!show) return '<p class="muted small">（間隔公式已隱藏，可在設定中開啟）</p>';
    var chain = '';
    chord.tones.forEach(function (t, i) {
      if (i > 0) {
        var prev = chord.tones[i - 1];
        var semis = t.semis - prev.semis;
        chain += '<span class="gap-arrow" aria-label="中間隔 ' + chord.gaps[i - 1] + ' 鍵">' +
          '<b>' + chord.gaps[i - 1] + '</b><svg viewBox="0 0 40 10" aria-hidden="true"><path d="M1 5h34m-5-4 5 4-5 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '<small>' + semis + ' 半音</small></span>';
      }
      chain += '<span class="gap-note">' + esc(t.name) + '</span>';
    });
    var bassPart = chord.bass
      ? '<p class="gap-bass">斜線低音（左手獨立彈奏，不列入公式）：<span class="pill pill-lh">' + esc(chord.bass.name) + '</span></p>'
      : '';
    return '<div class="gap-formula' + (chord.gaps.length > 3 ? ' long' : '') + '" aria-label="間隔公式 ' + chord.gapFormula + '">' + chord.gapFormula + '</div>' +
      '<div class="gap-chain">' + chain + '</div>' +
      '<p class="muted small">數字＝兩個要彈的琴鍵之間隔了幾個琴鍵（黑鍵、白鍵都算）；下方為傳統半音數。</p>' + bassPart;
  }

  function tonesHtml(chord, showNames) {
    return '<ul class="tones">' + chord.tones.map(function (t) {
      return '<li class="tone"><span class="tone-name">' + (showNames ? esc(t.name) : '?') + '</span>' +
        '<span class="tone-degree">' + esc(t.degree === '1' ? 'R' : t.degree.replace(/b/g, '♭').replace(/#/g, '♯')) + '</span>' +
        '<span class="tone-zh">' + esc(t.degreeZh) + '</span></li>';
    }).join('') + '</ul>';
  }

  function fingeringHtml(v, show) {
    if (!show) return '<p class="muted small">（指法已隱藏，可在設定中開啟）</p>';
    function row(notes, label, cls) {
      if (!notes.length) return '';
      return '<div class="hand-row ' + cls + '"><span class="hand-label">' + label + '</span><span class="hand-notes">' +
        notes.map(function (n) {
          return '<span class="hf"><span class="hf-name">' + esc(n.name) + '</span><span class="hf-finger" title="' +
            fingering.FINGER_ZH[n.finger] + '">' + n.finger + '</span></span>';
        }).join('') + '</span></div>';
    }
    return row(v.rh, '右手', 'rh') + row(v.lh, '左手', 'lh') +
      '<p class="finger-legend">1 拇指・2 食指・3 中指・4 無名指・5 小指</p>' +
      '<ul class="advice">' + v.advice.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
  }

  function renderAnswer() {
    if (!state.revealed) return;
    var c = state.chord, v = state.voicing;
    var showNames = prefs.showNames, showGaps = prefs.showGaps, showFingers = prefs.showFingers;

    var kbNotes = v.all.map(function (n) {
      return { midi: n.midi, name: n.name, finger: n.finger, hand: n.hand };
    });
    var kb = keyboard.render(kbNotes, { showNames: showNames, showFingers: showFingers });
    var st = staff.render(v, { title: c.symbol + ' 五線譜：' + v.all.map(function (n) { return n.fullName; }).join('、') });

    var symbolNote = c.label !== c.symbol ? '<span class="ans-alt">＝ ' + esc(c.symbol) + '</span>' : '';

    el.answer.innerHTML =
      '<div class="ans-head">' +
        '<div><h2 class="sr-only">答案：' + esc(c.zhName) + '</h2>' +
        '<p class="ans-sub">' + esc(c.label) + ' ' + symbolNote + '</p><p class="muted small ans-en">' + esc(c.enName) + '</p></div>' +
        '<div class="play-group">' +
          '<button type="button" class="btn btn-play" id="btn-play" aria-label="播放和弦">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>播放</button>' +
          '<button type="button" class="btn btn-play btn-play-alt" id="btn-arp" aria-label="分解播放和弦">分解</button>' +
        '</div>' +
      '</div>' +
      '<div class="ans-grid">' +
        '<section class="panel panel-kb"><h3>鋼琴鍵盤<span class="legend"><i class="lg-rh"></i>右手' +
          (v.lh.length ? '<i class="lg-lh"></i>左手' : '') + '</span></h3><div class="kb-wrap">' + kb.svg + '</div></section>' +
        '<section class="panel panel-gaps"><h3>琴鍵間隔公式</h3>' + gapsHtml(c, showGaps) + '</section>' +
        '<section class="panel panel-staff"><h3>五線譜</h3><div class="staff-wrap">' + st.svg + '</div></section>' +
        '<section class="panel panel-tones"><h3>組成音</h3>' + tonesHtml(c, showNames) +
          (c.bass ? '<p class="bass-line">指定低音：<span class="pill pill-lh">' + (showNames ? esc(c.bass.name) : '?') + '</span></p>' : '') +
        '</section>' +
        '<section class="panel panel-finger"><h3>建議指法</h3>' + fingeringHtml(v, showFingers) + '</section>' +
      '</div>';

    var midis = v.all.map(function (n) { return n.midi; });
    $('btn-play').addEventListener('click', function () { play(midis, false); });
    $('btn-arp').addEventListener('click', function () { play(midis, true); });
  }

  function play(midis, arp) {
    var ok = false;
    try { ok = audio.playChord(midis, { arpeggio: arp }); } catch (e) { ok = false; }
    if (!ok) toast('此瀏覽器不支援音訊播放');
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  /* ---------- 紀錄 ---------- */

  function updateStats() {
    var s = store.get();
    el.statSession.textContent = state.sessionCount;
    el.statTotal.textContent = s.total;
    var judged = s.correct + s.unsure;
    el.statAcc.textContent = judged ? Math.round(s.correct / judged * 100) + '%' : '–';
  }

  function renderRecords() {
    var s = store.get();
    el.storageStatus.textContent = store.persistent
      ? '紀錄會保存在此瀏覽器（localStorage）。已練習 ' + s.total + ' 題，答對 ' + s.correct + '、不熟 ' + s.unsure + '。'
      : '此瀏覽器無法使用 localStorage，紀錄只保留到關閉頁面為止（不影響練習）。';
    var weak = store.weakIds();
    el.weakList.innerHTML = weak.length
      ? '<h3>還不熟的和弦（會優先複習）</h3><div class="chips">' + weak.map(function (id) {
          return '<span class="pill">' + esc(s.chords[id].label || id) + '</span>';
        }).join('') + '</div>'
      : '<p class="muted small">目前沒有標記為不熟的和弦。</p>';
    var hist = s.history.slice(-12).reverse();
    el.historyList.innerHTML = hist.length
      ? '<h3>最近作答</h3><ol class="history">' + hist.map(function (h) {
          return '<li><span>' + esc(h.label || h.id) + '</span><span class="' + (h.result === 'correct' ? 'ok' : 'ng') + '">' +
            (h.result === 'correct' ? '答對' : '不熟') + '</span></li>';
        }).join('') + '</ol>'
      : '';
  }

  function judge(result) {
    if (!state.chord) return;
    store.record(state.chord.id, state.chord.label, result);
    nextQuestion();
    if ($('settings').open) renderRecords();
  }

  /* ---------- 事件 ---------- */

  el.card.addEventListener('click', function () { if (!state.revealed) reveal(); });
  el.card.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && !state.revealed) { e.preventDefault(); e.stopPropagation(); reveal(); }
  });
  $('btn-reveal').addEventListener('click', reveal);
  $('btn-skip').addEventListener('click', nextQuestion);
  $('btn-next').addEventListener('click', nextQuestion);
  $('btn-correct').addEventListener('click', function () { judge('correct'); });
  $('btn-unsure').addEventListener('click', function () { judge('unsure'); });
  $('btn-reset').addEventListener('click', function () {
    if (window.confirm('確定要清除所有練習紀錄嗎？')) { store.reset(); updateStats(); renderRecords(); }
  });
  $('settings').addEventListener('toggle', function () { if ($('settings').open) renderRecords(); });

  [['optNames', 'showNames'], ['optGaps', 'showGaps'], ['optFingers', 'showFingers']].forEach(function (p) {
    var input = el[p[0]];
    input.checked = prefs[p[1]] !== false;
    input.addEventListener('change', function () { store.setPref(p[1], input.checked); renderAnswer(); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === ' ' && (tag === 'button' || tag === 'summary')) return; // 讓按鈕自己處理
    if (e.key === ' ') { e.preventDefault(); if (state.revealed) nextQuestion(); else reveal(); }
    else if (state.revealed && e.key === '1') judge('unsure');
    else if (state.revealed && e.key === '2') judge('correct');
    else if (state.revealed && (e.key === 'p' || e.key === 'P')) play(state.voicing.all.map(function (n) { return n.midi; }), false);
  });

  /* ---------- 啟動 ---------- */
  renderModes();
  nextQuestion();
  window.PCLApp = { state: state, store: store, reveal: reveal, next: nextQuestion }; // 供除錯／測試
})();
