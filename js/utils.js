/* ============================================================
   utils.js — Yardımcı fonksiyonlar (cihaz, tema, format, bildirim)
   ============================================================ */
'use strict';

window.Utils = (function () {

  const CHUNK = 16 * 1024;
  const MAX_BUFFER = 1024 * 1024;

  function $(id) { return document.getElementById(id); }

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (window.innerWidth < 768 && 'ontouchstart' in window);

  function setStatus(text, cls) {
    const el = $('statusBadge');
    if (!el) return;
    el.textContent = text;
    const base = el.classList.contains('status') ? 'status' : 'badge';
    el.className = base + (cls ? ' ' + cls : '');
  }

  function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') document.body.classList.add('light');
    const btn = $('themeBtn');
    if (!btn) return;
    btn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
    btn.onclick = () => {
      document.body.classList.toggle('light');
      const light = document.body.classList.contains('light');
      localStorage.setItem('theme', light ? 'light' : 'dark');
      btn.textContent = light ? '☀️' : '🌙';
    };
  }

  function showProgress(text, pct, done) {
    const wrap = $('progressWrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    const fill = $('progressFill');
    const txt = $('progressText');
    if (fill) fill.style.width = pct + '%';
    if (txt) txt.textContent = text + ' — %' + pct;
    if (done) setTimeout(() => wrap.classList.add('hidden'), 1500);
  }

  function notify(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: 'icons/icon-192.png' }); } catch (e) { }
    }
  }

  function askNotifyPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { });
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { }
      document.body.removeChild(ta);
      return false;
    }
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { });
    }
  }

  return {
    CHUNK, MAX_BUFFER,
    $, fmtSize, isMobile,
    setStatus, initTheme, showProgress,
    notify, askNotifyPermission, copyText, registerSW
  };
})();