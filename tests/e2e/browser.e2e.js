'use strict';
/*
 * 瀏覽器端對端測試（Playwright + Chromium）
 * 執行：node tests/e2e/browser.e2e.js
 *
 * 1. 以 file:// 直接開啟 index.html
 * 2. 以本機靜態伺服器模擬 GitHub Pages 子路徑 /piano-chord-lab/
 * 3. Samsung Galaxy 手機尺寸與桌面尺寸
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = '/piano-chord-lab/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain' };

function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (!url.startsWith(BASE)) { res.writeHead(404); return res.end('not found'); }
    let rel = url.slice(BASE.length) || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('  ✓ ' + name); }
  catch (e) { results.push([false, name]); console.log('  ✗ ' + name + '\n    ' + (e && e.stack || e)); }
}

async function openPage(browser, url, opts = {}) {
  const ctx = await browser.newContext(opts.context || { ...devices['Galaxy S9+'] });
  if (opts.blockStorage) {
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(url);
  await page.waitForSelector('#q-symbol');
  return { ctx, page, errors };
}

async function noHorizontalScroll(page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, `頁面寬度 ${sw} > 視窗 ${iw}`);
}

async function revealedMidis(page) {
  return page.evaluate(() => {
    const kb = [...document.querySelectorAll('.kb-svg [data-on="1"]')].map((e) => +e.dataset.midi).sort((a, b) => a - b);
    const st = [...document.querySelectorAll('.staff-svg .note')].map((e) => +e.dataset.midi).sort((a, b) => a - b);
    return { kb, st };
  });
}

(async () => {
  const browser = await chromium.launch();
  const server = await startServer();
  const httpUrl = `http://127.0.0.1:${server.address().port}${BASE}`;
  const fileUrl = 'file://' + path.join(ROOT, 'index.html');

  console.log('Piano Chord Lab — 瀏覽器測試');

  for (const [label, url] of [['file://', fileUrl], ['GitHub Pages 子路徑', httpUrl]]) {
    await check(`${label}：正常載入、無錯誤、顯示題目`, async () => {
      const { ctx, page, errors } = await openPage(browser, url);
      const sym = await page.textContent('#q-symbol');
      assert.ok(sym && sym !== '–', '應顯示和弦代號');
      assert.equal(await page.title(), 'Piano Chord Lab｜鋼琴和弦練習');
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

  await check('揭曉前不洩漏音符、五線譜、鍵盤或指法', async () => {
    const { ctx, page } = await openPage(browser, httpUrl);
    for (let i = 0; i < 10; i++) {
      const leak = await page.evaluate(() => ({
        answer: document.getElementById('answer').innerHTML,
        svgs: document.querySelectorAll('.kb-svg, .staff-svg').length,
        answerBits: document.querySelectorAll('.tones, .gap-formula, .hf, .finger-badge, [data-midi]').length,
        cardText: document.getElementById('question-card').innerText
      }));
      assert.equal(leak.answer, '', '答案區應為空');
      assert.equal(leak.svgs, 0);
      assert.equal(leak.answerBits, 0, '頁面不應有任何答案元素');
      assert.ok(!/\d+－\d+/.test(leak.cardText), '題目卡不應出現間隔公式');
      assert.equal(await page.isVisible('#btn-correct'), false);
      await page.click('#btn-skip');
    }
    await ctx.close();
  });

  await check('點擊題目揭曉答案：五線譜與鍵盤音高一致、顯示間隔與指法', async () => {
    const { ctx, page } = await openPage(browser, httpUrl);
    for (let i = 0; i < 15; i++) {
      await page.click('#question-card');
      await page.waitForSelector('.kb-svg');
      const { kb, st } = await revealedMidis(page);
      assert.ok(kb.length >= 3);
      assert.deepEqual(kb, st, '鍵盤與五線譜音高需一致');
      const formula = await page.textContent('.gap-formula');
      assert.match(formula, /^\d+(－\d+)+$/);
      assert.ok(await page.locator('.kb-svg .finger-badge').count() >= 3);
      await noHorizontalScroll(page);
      await page.click('#btn-next');
    }
    await ctx.close();
  });

  await check('模式 A 指定題目的答案內容', async () => {
    const { ctx, page } = await openPage(browser, httpUrl);
    const expected = {
      'Emaj7': ['3－2－3', [64, 68, 71, 75]],
      'D♯m7': ['2－3－2', [63, 66, 70, 73]],
      'G♯m7': ['2－3－2', [68, 71, 75, 78]],
      'C♯m7(9)': ['2－3－2－3', [49, 64, 68, 71, 75]],
      'C♯m7(-5)/F♯': ['2－2－3', [54, 61, 64, 67, 71]]
    };
    const found = new Set();
    for (let i = 0; i < 60 && found.size < 5; i++) {
      const sym = (await page.textContent('#q-symbol')).trim();
      await page.click('#btn-reveal');
      const [formula, midis] = expected[sym];
      assert.equal((await page.textContent('.gap-formula')).trim(), formula, sym);
      const { kb, st } = await revealedMidis(page);
      assert.deepEqual(kb, midis, sym); assert.deepEqual(st, midis, sym);
      if (sym === 'C♯m7(-5)/F♯') {
        assert.equal(await page.locator('.staff-svg .note.lh').count(), 1, '低音譜表只有 F♯');
        assert.equal(await page.locator('.kb-svg .key.on.lh').count(), 1, '左手只按一個鍵');
        assert.ok((await page.textContent('.gap-bass')).includes('F♯'));
      }
      found.add(sym);
      await page.click('#btn-next');
    }
    assert.equal(found.size, 5, '五個題目都應出現');
    await ctx.close();
  });

  await check('切換模式與連續隨機出題不重複', async () => {
    const { ctx, page } = await openPage(browser, httpUrl);
    for (const mode of ['B', 'C', 'D', 'E', 'A']) {
      await page.click(`[data-mode="${mode}"]`);
      assert.equal(await page.getAttribute(`[data-mode="${mode}"]`, 'aria-checked'), 'true');
      let prev = await page.textContent('#q-symbol');
      for (let i = 0; i < 25; i++) {
        await page.click('#btn-skip');
        const cur = await page.textContent('#q-symbol');
        assert.notEqual(cur, prev, `模式 ${mode} 連續兩題相同：${cur}`);
        prev = cur;
      }
    }
    await ctx.close();
  });

  await check('「我答對了／我還不熟」與 localStorage 紀錄', async () => {
    const { ctx, page } = await openPage(browser, httpUrl);
    await page.click('#btn-reveal');
    await page.click('#btn-unsure');
    await page.click('#btn-reveal');
    await page.click('#btn-correct');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pianoChordLab.v1')));
    assert.equal(stored.unsure, 1); assert.equal(stored.correct, 1);
    assert.equal(stored.total, 3);
    assert.equal(await page.textContent('#stat-session'), '3');
    await page.reload();
    await page.waitForSelector('#q-symbol');
    assert.equal(await page.textContent('#stat-total'), '4', '重新整理後累計題數保留');
    await page.click('#settings summary');
    await page.waitForSelector('#weak-list .pill');
    await ctx.close();
  });

  await check('localStorage 無法使用時仍能正常練習', async () => {
    const { ctx, page, errors } = await openPage(browser, httpUrl, { blockStorage: true });
    for (let i = 0; i < 5; i++) {
      await page.click('#question-card');
      await page.waitForSelector('.kb-svg');
      await page.click(i % 2 ? '#btn-correct' : '#btn-unsure');
    }
    assert.equal(await page.textContent('#stat-session'), '6');
    await page.click('#settings summary');
    await page.waitForFunction(() => document.getElementById('storage-status').textContent.includes('無法使用 localStorage'));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('顯示設定：可隱藏音名、間隔與指法', async () => {
    const { ctx, page } = await openPage(browser, httpUrl);
    await page.click('#btn-reveal');
    await page.click('#settings summary');
    await page.uncheck('#opt-names');
    await page.uncheck('#opt-fingers');
    await page.uncheck('#opt-gaps');
    assert.equal(await page.locator('.kb-svg .kb-name').count(), 0);
    assert.equal(await page.locator('.kb-svg .finger-badge').count(), 0);
    assert.equal(await page.locator('.gap-formula').count(), 0);
    await page.check('#opt-names');
    assert.ok(await page.locator('.kb-svg .kb-name').count() > 0);
    await ctx.close();
  });

  await check('播放和弦（使用者觸發）不產生錯誤', async () => {
    const { ctx, page, errors } = await openPage(browser, httpUrl);
    await page.click('#btn-reveal');
    await page.click('#btn-play');
    await page.click('#btn-arp');
    await page.waitForTimeout(200);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('窄螢幕排版（320px～412px）與桌面：無橫向捲動、按鈕觸控範圍足夠', async () => {
    const sizes = [
      { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true },
      { ...devices['Galaxy S9+'] },
      { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 },
      { viewport: { width: 1366, height: 900 } }
    ];
    for (const context of sizes) {
      const { ctx, page } = await openPage(browser, httpUrl, { context });
      await page.click('[data-mode="E"]');
      for (let i = 0; i < 12; i++) {
        await page.click('#btn-reveal');
        await noHorizontalScroll(page);
        const kbBox = await page.locator('.kb-svg').boundingBox();
        assert.ok(kbBox.width <= context.viewport.width, '鍵盤不超出畫面');
        await page.click('#btn-next');
      }
      for (const id of ['#btn-reveal', '#btn-skip']) {
        const box = await page.locator(id).boundingBox();
        assert.ok(box.height >= 44, id + ' 高度 ' + box.height);
      }
      await ctx.close();
    }
  });

  await check('無障礙：按鈕都有可讀名稱', async () => {
    const { ctx, page } = await openPage(browser, httpUrl);
    await page.click('#btn-reveal');
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"]')]
      .filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length);
    assert.equal(unnamed, 0);
    await ctx.close();
  });

  await check('鍵盤快速鍵：空白鍵揭曉／下一題、2 = 我答對了', async () => {
    const { ctx, page } = await openPage(browser, httpUrl, { context: { viewport: { width: 1200, height: 800 } } });
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    await page.waitForSelector('.kb-svg');
    await page.keyboard.press('2');
    assert.equal(await page.locator('.kb-svg').count(), 0);
    assert.equal(await page.textContent('#stat-session'), '2');
    await ctx.close();
  });

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} 通過`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
