/* ============================================================
   broadcast.js — Hoca → Öğrenci toplu gönderim + günlük (ALŞ09)
   Akış: Önce dosya seç → sonra peer aç + QR göster
   ============================================================ */
'use strict';

window.Broadcast = (function () {

  const students = {}; // sid -> {conn, progress, status, name, sending}
  let fileBlob = null;
  let fileName = '';
  let peerStarted = false;

  /* ---------- Yardımcılar ---------- */

  function reset() {
    Object.keys(students).forEach(k => delete students[k]);
    fileBlob = null;
    fileName = '';
    peerStarted = false;
  }

  function log(msg, cls) {
    const el = Utils.$('teacherLog');
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML =
      `<span class="time">${new Date().toLocaleTimeString()}</span>` +
      `<span class="msg ${cls || ''}">${msg}</span>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function updateCount() {
    const n = Object.values(students).filter(s => s.status !== 'disconnected').length;
    const el = Utils.$('connCount');
    if (el) el.textContent = n + ' öğrenci';
  }

  function renderLog() {
    const el = Utils.$('teacherLog');
    if (!el) return;
    Object.entries(students).forEach(([sid, s]) => {
      let row = document.getElementById('stu-' + sid);
      if (!row) {
        row = document.createElement('div');
        row.className = 'log-entry';
        row.id = 'stu-' + sid;
        el.appendChild(row);
      }
      const cls = s.status === 'done' ? 'done'
        : s.status === 'disconnected' ? 'err'
          : s.status === 'error' ? 'err' : 'pending';
      row.innerHTML =
        `<span class="time">${new Date().toLocaleTimeString()}</span>` +
        `<span class="msg ${cls}">${s.name} — %${s.progress} [${s.status}]</span>` +
        `<div class="stu-bar" style="flex-basis:100%;margin-top:4px">` +
        `<div class="fill" style="width:${s.progress}%"></div></div>`;
      el.scrollTop = el.scrollHeight;
    });
    updateCount();
  }

  /* ---------- Gönderim ---------- */

  async function sendToStudent(sid, c) {
    const s = students[sid];
    if (!s || s.sending) return;
    if (!fileBlob) return;

    s.sending = true;
    s.status = 'pending';
    s.progress = 0;
    renderLog();

    try {
      await FileTransfer.send(fileBlob, c, {
        silent: true,
        onProgress: (pct) => {
          s.progress = pct;
          s.status = pct >= 100 ? 'done' : 'pending';
          renderLog();
        }
      });
      s.status = 'done';
      s.progress = 100;
      renderLog();
      log(`${fileName} → ${s.name} tamamlandı`, 'ok');
    } catch (e) {
      s.status = 'error';
      log(`${fileName} → ${s.name} hata: ${e.message}`, 'err');
    } finally {
      s.sending = false;
    }
  }

  function sendToAll() {
    if (!fileBlob) return;
    Object.entries(students).forEach(([sid, s]) => {
      if (s.conn.open && s.status !== 'disconnected' && !s.sending) {
        sendToStudent(sid, s.conn);
      }
    });
  }

  /* ---------- Aşama 2: Oda aç ---------- */

  async function openRoom() {
    if (peerStarted) return;
    peerStarted = true;

    const $ = Utils.$;
    $('teacherStage1').classList.add('hidden');
    $('teacherStage2_left').classList.remove('hidden');
    $('teacherStage2_right').classList.remove('hidden');

    // Birebir bağlantıya geç butonu
    const toPairBtn = $('toPairBtn');
    if (toPairBtn) {
      toPairBtn.onclick = () => {
        location.href = 'desktop.html?mode=pair';
      };
    }

    // Aşama 2'deki dosya input'unu bağla (dosya değiştirmek için)
    const tf2 = $('teacherFile2');
    if (tf2) {
      tf2.onchange = (e) => {
        const f = e.target.files[0];
        if (f) setFile(f);
      };
    }

    // Kopyalama butonu
    const copyBtn = $('copyTeacherIdBtn');
    const idText = $('teacherIdText');
    if (copyBtn && idText) {
      copyBtn.onclick = async () => {
        await Utils.copyText(idText.textContent);
        copyBtn.textContent = '✓ Kopyalandı';
        setTimeout(() => copyBtn.textContent = '📋 ID\'yi Kopyala', 1500);
      };
      idText.onclick = () => copyBtn.click();
    }

    // Sürükle-bırak (aşama 2'de çalışsın)
    Chat.bindDragDrop((f) => setFile(f));

    try {
      const id = await WebRTC.init();
      idText.textContent = id;
      QR.draw($('teacherQrCanvas'), id);
      log('Oda açıldı. Öğrenciler bekleniyor…', 'ok');

      WebRTC.onIncoming((c) => {
        const sid = c.peer;
        students[sid] = {
          conn: c,
          progress: 0,
          status: 'connected',
          name: sid.slice(-6),
          sending: false
        };
        log(`Öğrenci bağlandı: ${students[sid].name}`, 'ok');
        updateCount();

        c.on('open', () => {
          if (fileBlob) sendToStudent(sid, c);
          else log(`${students[sid].name} bağlı — dosya bekleniyor`, 'pending');
        });

        c.on('data', (d) => {
          if (d.type === 'progress') {
            const s = students[sid];
            if (s) {
              s.progress = d.pct;
              s.status = d.pct >= 100 ? 'done' : 'pending';
              renderLog();
            }
          }
        });

        c.on('close', () => {
          const s = students[sid];
          if (s) {
            s.status = 'disconnected';
            log(`${s.name} ayrıldı`, 'err');
            renderLog();
          }
        });

        c.on('error', (e) => {
          log(`${students[sid]?.name} hata: ${e.type || e}`, 'err');
        });
      });
    } catch (e) {
      log('Başlatma hatası: ' + e.message, 'err');
      $('teacherStage1').classList.remove('hidden');
      $('teacherStage2_left').classList.add('hidden');
      $('teacherStage2_right').classList.add('hidden');
      peerStarted = false;
    }
  }

  /* ---------- Dosya seçimi ---------- */

  function setFile(f) {
    fileBlob = f;
    fileName = f.name;

    const name1 = Utils.$('teacherFileName');
    const name2 = Utils.$('teacherFileName2');
    if (name1) name1.textContent = f.name + ' (' + Utils.fmtSize(f.size) + ')';
    if (name2) name2.textContent = f.name + ' (' + Utils.fmtSize(f.size) + ')';

    if (!peerStarted) {
      openRoom();
    } else {
      log('Dosya değiştirildi: ' + f.name, 'ok');
      sendToAll();
    }
  }

  /* ---------- Başlat ---------- */

  function start() {
    const $ = Utils.$;
    $('modeTitle').textContent = 'Hoca Modu — Toplu Dağıtım';
    const pv = $('pairView');
    if (pv) pv.classList.add('hidden');
    $('teacherView').classList.remove('hidden');

    reset();

    $('teacherStage1').classList.remove('hidden');
    $('teacherStage2_left').classList.add('hidden');
    $('teacherStage2_right').classList.add('hidden');

    const tf = $('teacherFile');
    if (tf) {
      tf.onchange = (e) => {
        const f = e.target.files[0];
        if (f) setFile(f);
      };
    }

    log('Dosya seçin…', 'pending');
  }

  return { start, setFile, reset };
})();