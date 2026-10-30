/* =========================================================
 * LIVE ORDER LOTTERY
 * 構成: CONFIG / Lottery(抽選) / Store(保存) / Sound(効果音)
 *       / Anim(アニメーション) / UI(画面制御)
 * ========================================================= */
(function () {
  'use strict';

  // ---- 設定：別イベントで再利用する時は EVENT_ID を変更 ----
  var CONFIG = {
    EVENT_ID: '2026-event01',
    MIN: 1,
    MAX: 9999,
    SPIN_MS: 2600,
    // テスト用リセット合言葉：URL末尾に ?reset=この値 を付けて開くと抽選結果を消去
    // 本番前に推測されにくい値へ変更するか、空文字にして無効化してください
    RESET_CODE: 'FVbIxryOOinz'
  };
  var STORAGE_KEY = 'live-order-lottery-' + CONFIG.EVENT_ID;
  var SOUND_KEY = 'live-order-lottery-sound';

  /* ---------- Lottery：偏りのない乱数 ---------- */
  var Lottery = {
    draw: function () {
      var range = CONFIG.MAX - CONFIG.MIN + 1;           // 9999
      var limit = Math.floor(0x100000000 / range) * range; // 剰余バイアス回避
      var buf = new Uint32Array(1);
      var x;
      do {
        window.crypto.getRandomValues(buf);
        x = buf[0];
      } while (x >= limit);
      return CONFIG.MIN + (x % range);
    },
    isValid: function (n) {
      return typeof n === 'number' && Math.floor(n) === n && n >= CONFIG.MIN && n <= CONFIG.MAX;
    }
  };

  /* ---------- Store：localStorage ---------- */
  var Store = {
    available: function () {
      try {
        var k = '__llt_test__';
        window.localStorage.setItem(k, '1');
        var ok = window.localStorage.getItem(k) === '1';
        window.localStorage.removeItem(k);
        return ok;
      } catch (e) { return false; }
    },
    // 戻り値: {status:'none'} | {status:'ok', number} | {status:'corrupt'}
    load: function () {
      var raw;
      try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) { return { status: 'none' }; }
      if (raw === null) return { status: 'none' };
      try {
        var d = JSON.parse(raw);
        if (d && d.version === 1 && d.drawn === true && Lottery.isValid(d.number)) {
          return { status: 'ok', number: d.number };
        }
      } catch (e) { /* fallthrough */ }
      return { status: 'corrupt' };
    },
    // 保存して読み戻し確認。成功時 true
    save: function (n) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, drawn: true, number: n }));
        var r = Store.load();
        return r.status === 'ok' && r.number === n;
      } catch (e) { return false; }
    }
  };

  /* ---------- Sound：Web Audio API ---------- */
  var Sound = {
    ctx: null,
    enabled: true,
    // タップ操作内で呼ぶ（iOS対策）
    unlock: function () {
      if (!Sound.enabled) return;
      try {
        if (!Sound.ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          Sound.ctx = new AC();
        }
        if (Sound.ctx.state === 'suspended') Sound.ctx.resume();
        // 無音バッファを鳴らして解錠
        var b = Sound.ctx.createBuffer(1, 1, 22050);
        var s = Sound.ctx.createBufferSource();
        s.buffer = b; s.connect(Sound.ctx.destination); s.start(0);
      } catch (e) { Sound.ctx = null; }
    },
    tone: function (freq, start, dur, type, vol) {
      var c = Sound.ctx;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g); g.connect(c.destination);
      o.start(start); o.stop(start + dur + 0.02);
      return o;
    },
    safe: function (fn) {
      if (!Sound.enabled || !Sound.ctx) return;
      try { fn(Sound.ctx.currentTime); } catch (e) { /* 音が出なくても続行 */ }
    },
    rattle: function (ms) {
      Sound.safe(function (t0) {
        var dur = ms / 1000, t = 0, i = 0;
        while (t < dur) {
          // 加速→減速に合わせて間隔を変える
          var p = t / dur;
          var gap = 0.05 + 0.09 * Math.abs(p - 0.4) * 1.6;
          Sound.tone(900 + (i % 3) * 260 + Math.random() * 200, t0 + t, 0.04, 'square', 0.06);
          t += gap; i++;
        }
      });
    },
    pon: function () {
      Sound.safe(function (t0) {
        var c = Sound.ctx;
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(620, t0);
        o.frequency.exponentialRampToValueAtTime(180, t0 + 0.18);
        g.gain.setValueAtTime(0.35, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + 0.3);
      });
    },
    fanfare: function () {
      Sound.safe(function (t0) {
        [523, 659, 784, 1047].forEach(function (f, i) {
          Sound.tone(f, t0 + i * 0.11, i === 3 ? 0.45 : 0.14, 'triangle', 0.18);
        });
      });
    }
  };

  /* ---------- Anim：requestAnimationFrame で回転 ---------- */
  var Anim = {
    reduced: function () {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },
    // 加速→等速→減速（ease-in-out）で回す。完了時 done()
    spin: function (drum, handle, inner, ms, done) {
      var finished = false;
      function finish() { if (!finished) { finished = true; done(); } }
      // 保険：rAFが止まっても必ず結果へ進む
      var guard = setTimeout(finish, ms + 1500);
      if (!window.requestAnimationFrame) {
        clearTimeout(guard); setTimeout(finish, 300); return;
      }
      // 視差効果を減らす設定時は、短く1回転だけにする
      var turns = 4, start = null;
      if (Anim.reduced()) { turns = 1; ms = 1200; }
      function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
      function frame(ts) {
        try {
          if (start === null) start = ts;
          var p = Math.min(1, (ts - start) / ms);
          var deg = ease(p) * 360 * turns;
          // iOS SafariはSVG要素へのCSS transformが不安定なため、SVG属性で回転させる
          drum.setAttribute('transform', 'rotate(' + deg + ' 160 140)');
          handle.setAttribute('transform', 'rotate(' + deg + ' 160 140)');
          // 中の玉が転がって見えるよう逆回転＋揺れ
          inner.setAttribute('transform', 'rotate(' + (-deg) + ' 160 140) translate(0 ' + (Math.sin(deg / 20) * 4) + ')');
          if (p < 1) window.requestAnimationFrame(frame);
          else { clearTimeout(guard); finish(); }
        } catch (e) { clearTimeout(guard); finish(); }
      }
      window.requestAnimationFrame(frame);
    },
    popBall: function (ball, number, done) {
      var colors = ['#e94b3c', '#f2c230', '#3d8bd9', '#48b06a', '#e67e22', '#9b59b6'];
      ball.setAttribute('fill', colors[number % colors.length]);
      ball.classList.remove('pop');
      void ball.getBoundingClientRect(); // 再生リセット
      ball.classList.add('pop');
      setTimeout(done, Anim.reduced() ? 50 : 700);
    }
  };

  /* ---------- UI ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  var busy = false;

  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = false;
  }

  function showResult(n, animate) {
    el.controls.hidden = true;
    el.lead.textContent = 'あなたの抽選番号が決まりました';
    el.resultNumber.textContent = String(n);
    el.result.hidden = false;
    if (animate) el.result.classList.add('show');
    // 再訪問時も玉を出しておく
    if (!animate) {
      var colors = ['#e94b3c', '#f2c230', '#3d8bd9', '#48b06a', '#e67e22', '#9b59b6'];
      el.ball.setAttribute('fill', colors[n % colors.length]);
      el.ball.style.opacity = '1';
      el.ball.style.transform = 'translate(38px,4px)';
    }
  }

  function onSpin() {
    if (busy) return;          // 連打防止
    busy = true;
    el.spinBtn.disabled = true;
    el.spinBtn.textContent = '抽選中…';

    Sound.unlock();             // タップ起点で音声解錠

    // 既に結果があるなら（別タブ等）それを表示
    var existing = Store.load();
    if (existing.status === 'ok') { showResult(existing.number, false); return; }
    if (existing.status === 'corrupt') { lockCorrupt(); return; }

    if (!Store.available()) {
      showError('この環境では抽選結果を保存できないため、抽選できません。プライベートブラウズをオフにするか、別のブラウザでお試しください。');
      el.spinBtn.textContent = '抽選できません';
      return;
    }

    var n = Lottery.draw();
    if (!Store.save(n)) {
      showError('抽選結果を保存できなかったため、抽選を中止しました。ブラウザの設定を確認するか、主催者にご連絡ください。');
      el.spinBtn.textContent = '抽選できません';
      return;
    }

    // 保存成功後に演出開始
    Sound.rattle(CONFIG.SPIN_MS);
    Anim.spin(el.drum, el.handle, el.inner, CONFIG.SPIN_MS, function () {
      Sound.pon();
      Anim.popBall(el.ball, n, function () {
        Sound.fanfare();
        showResult(n, true);
      });
    });
  }

  function lockCorrupt() {
    el.spinBtn.disabled = true;
    el.spinBtn.textContent = '抽選できません';
    showError('保存されている抽選データを読み取れませんでした。再抽選はできませんので、お手数ですが主催者にご連絡ください。');
  }

  function onCopy() {
    var text = el.resultNumber.textContent;
    function ok() { el.copyStatus.textContent = 'コピーしました：' + text; }
    function ng() { el.copyStatus.textContent = 'コピーできませんでした。番号を長押ししてコピーしてください。'; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, function () { fallbackCopy(text) ? ok() : ng(); });
    } else {
      fallbackCopy(text) ? ok() : ng();
    }
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.fontSize = '16px';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, text.length);
      var r = document.execCommand('copy');
      document.body.removeChild(ta);
      return r;
    } catch (e) { return false; }
  }

  function initSoundToggle() {
    try {
      var s = window.localStorage.getItem(SOUND_KEY);
      if (s === 'off') Sound.enabled = false;
    } catch (e) { /* noop */ }
    el.soundToggle.checked = Sound.enabled;
    el.soundToggle.addEventListener('change', function () {
      Sound.enabled = el.soundToggle.checked;
      try { window.localStorage.setItem(SOUND_KEY, Sound.enabled ? 'on' : 'off'); } catch (e) { /* noop */ }
      if (Sound.enabled) Sound.unlock();
    });
  }

  // テスト用：?reset=合言葉 で抽選結果を消去し、URLから引数を外す
  function handleReset() {
    if (!CONFIG.RESET_CODE) return;
    try {
      var m = window.location.search.match(/[?&]reset=([^&]*)/);
      if (!m || decodeURIComponent(m[1]) !== CONFIG.RESET_CODE) return;
      window.localStorage.removeItem(STORAGE_KEY);
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) { /* noop */ }
  }

  function init() {
    ['lead', 'controls', 'spinBtn', 'result', 'resultNumber', 'copyBtn', 'copyStatus',
     'error', 'soundToggle', 'ball', 'handle'].forEach(function (id) { el[id] = $(id); });
    el.drum = $('drum');
    el.inner = $('innerBalls');

    handleReset();
    initSoundToggle();
    el.copyBtn.addEventListener('click', onCopy);

    if (!window.crypto || !window.crypto.getRandomValues) {
      el.spinBtn.disabled = true;
      showError('このブラウザは抽選に必要な機能に対応していません。最新のブラウザでお試しください。');
      return;
    }

    var saved = Store.load();
    if (saved.status === 'ok') { showResult(saved.number, false); return; }
    if (saved.status === 'corrupt') { lockCorrupt(); return; }
    if (!Store.available()) {
      el.spinBtn.disabled = true;
      showError('この環境では抽選結果を保存できないため、抽選できません。プライベートブラウズをオフにするか、別のブラウザでお試しください。');
      return;
    }
    el.spinBtn.addEventListener('click', onSpin);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
