/* ============================================================
   chat.js — Sohbet arayüzü (mesaj ekleme, girişler, geçmiş, sürükle-bırak)
   ============================================================ */
'use strict';

window.Chat = (function () {

  const HISTORY_KEY = 'chatHistory';

  function addMsg(text, type, extraHtml, opts) {
    const box = Utils.$('messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'msg ' + type;
    if (extraHtml) div.innerHTML = extraHtml;
    else div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    if (!opts || opts.save !== false) saveHistory();
  }

  function saveHistory() {
    const box = Utils.$('messages');
    if (!box) return;
    const msgs = [...box.children].slice(-50).map(el => ({
      cls: el.className,
      html: el.innerHTML
    }));
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs)); } catch (e) { }
  }

  function loadHistory() {
    const box = Utils.$('messages');
    if (!box) return;
    try {
      const msgs = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      msgs.forEach(m => {
        const div = document.createElement('div');
        div.className = m.cls;
        div.innerHTML = m.html;
        box.appendChild(div);
      });
      box.scrollTop = box.scrollHeight;
    } catch (e) { }
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
  }

  function enableUI(enabled) {
    const input = Utils.$('msgInput');
    const sendBtn = Utils.$('sendBtn');
    const fileInput = Utils.$('fileInput');
    if (input) input.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
    if (fileInput) fileInput.disabled = !enabled;
  }

  /**
   * Sohbet girişlerini bağlar.
   * @param {object} opts { canSend(), onText(text), onFile(file) }
   */
  function bindInputs(opts) {
    opts = opts || {};
    const input = Utils.$('msgInput');
    const sendBtn = Utils.$('sendBtn');
    const fileInput = Utils.$('fileInput');
    if (!input || !sendBtn) return;

    const fire = () => {
      const v = input.value.trim();
      if (!v || !opts.canSend || !opts.canSend()) return;
      opts.onText(v);
      input.value = '';
      input.focus();
    };

    sendBtn.onclick = fire;
    input.onkeydown = (e) => { if (e.key === 'Enter') fire(); };

    if (fileInput) {
      fileInput.onchange = (e) => {
        const f = e.target.files[0];
        if (f && opts.canSend && opts.canSend() && opts.onFile) opts.onFile(f);
        e.target.value = '';
      };
    }
  }

  function bindDragDrop(onFile) {
    const overlay = Utils.$('dropOverlay');
    let dragCount = 0;
    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCount++;
      if (overlay) overlay.classList.add('active');
    });
    document.addEventListener('dragleave', () => {
      dragCount--;
      if (dragCount <= 0) { dragCount = 0; if (overlay) overlay.classList.remove('active'); }
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCount = 0;
      if (overlay) overlay.classList.remove('active');
      const f = e.dataTransfer.files[0];
      if (f && onFile) onFile(f);
    });
  }

  return { addMsg, loadHistory, saveHistory, clearHistory, enableUI, bindInputs, bindDragDrop };
})();