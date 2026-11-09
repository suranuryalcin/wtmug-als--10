/* ============================================================
   app.js — Ana yönlendirici; moda ve cihaza göre modülleri başlatır
   ============================================================ */

'use strict';

(function () {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || 'pair';

  // Hangi sayfadayız? (DOM üzerinden)
  const isDesktopPage = !!document.getElementById('pairView');

  // Tema + SW ortak
  Utils.initTheme();
  Utils.registerSW();
  Utils.askNotifyPermission();

  // ============================================================
  // ORTAK: DataChannel'ı pair modunda dinle
  // ============================================================
  function wirePairConn(c, receiver) {
    c.on('data', (data) => {
      switch (data.type) {
        case 'text':
          Chat.addMsg(data.text, 'received');
          break;
        case 'file-meta':
          receiver.start(data);
          Chat.addMsg(`📎 ${data.name} (${Utils.fmtSize(data.size)}) alınıyor…`, 'system', null, { save: false });
          Utils.showProgress('Alınıyor: ' + data.name, 0);
          break;
        case 'file-chunk':
          Utils.showProgress('Alınıyor: ' + receiver.name, receiver.addChunk(data.data));
          break;
        case 'file-end': {
          const blob = receiver.finalize();
          const html = FileTransfer.renderFileCard(blob, receiver.name, receiver.mime);
          Chat.addMsg('', 'received', html);
          Utils.showProgress('Transfer tamamlandı ✓', 100, true);
          Utils.notify('Dosya alındı', receiver.name);
          break;
        }
      }
    });

    c.on('close', () => {
      Utils.setStatus('Bağlantı kesildi');
      Chat.enableUI(false);
      WebRTC.stopQoS();
      Chat.addMsg('Bağlantı kesildi.', 'system', null, { save: false });
      WebRTC.clearConn();
    });

    c.on('error', (e) => {
      console.error('[pair] conn error', e);
      Utils.setStatus('Bağlantı hatası', 'error');
    });
  }

  // ============================================================
  // MASAÜSTÜ: Birebir host (desktop.html?mode=pair)
  // ============================================================
  async function startPair() {
    const $ = Utils.$;
    $('modeTitle').textContent = 'Birebir Bağlantı';

    const pv = $('pairView');
    if (pv) pv.classList.remove('hidden');
    const tv = $('teacherView');
    if (tv) tv.classList.add('hidden');

    Chat.loadHistory();

    const receiver = new FileTransfer.Receiver();

    Chat.bindInputs({
      canSend: () => WebRTC.getConn() && WebRTC.getConn().open,
      onText: (v) => {
        WebRTC.getConn().send({ type: 'text', text: v });
        Chat.addMsg(v, 'sent');
      },
      onFile: (f) => {
        FileTransfer.send(f, WebRTC.getConn()).catch(e => alert('Gönderim hatası: ' + e.message));
      }
    });

    Chat.bindDragDrop((f) => {
      const c = WebRTC.getConn();
      if (c && c.open) FileTransfer.send(f, c).catch(e => alert('Gönderim hatası: ' + e.message));
    });

    const copyBtn = $('copyIdBtn');
    const idText = $('peerIdText');
    if (copyBtn && idText) {
      copyBtn.onclick = async () => {
        await Utils.copyText(idText.textContent);
        copyBtn.textContent = '✓ Kopyalandı';
        setTimeout(() => copyBtn.textContent = '📋 ID\'yi Kopyala', 1500);
      };
      idText.onclick = () => copyBtn.click();
    }

    try {
      const id = await WebRTC.init();
      if (idText) idText.textContent = id;
      QR.draw($('qrCanvas'), id);
      Utils.setStatus('QR kodu okutun');

      WebRTC.onIncoming((c) => {
        const existing = WebRTC.getConn();
        if (existing && existing.open) { try { c.close(); } catch (e) { } return; }

        WebRTC.setConn(c);
        wirePairConn(c, receiver);

        c.on('open', () => {
          Utils.setStatus('Bağlı ✓', 'connected');
          Chat.enableUI(true);
          Chat.addMsg('Bağlantı kuruldu. Uçtan uca şifreli.', 'system', null, { save: false });
          WebRTC.startQoS(c);
        });
      });
    } catch (e) {
      Utils.setStatus('Hata: ' + e.message, 'error');
    }
  }

  // ============================================================
  // MOBİL: Birebir client (mobile.html?mode=pair)
  // ============================================================
  function startPairMobile() {
    const $ = Utils.$;
    $('modeTitle').textContent = 'Birebir Bağlantı (Mobil)';
    $('hintText').textContent = 'Bilgisayardaki QR kodu okutun veya ID girin.';

    if (!window.isSecureContext) {
      const n = $('deviceNotice');
      if (n) {
        n.style.display = 'block';
        n.textContent = '⚠️ Kamera ve WebRTC için HTTPS gerekir.';
      }
    }

    const receiver = new FileTransfer.Receiver();

    // Sadece "Bağlan" butonu (Kamera butonu aşağıdaki güvenlik ağında bağlanıyor)
    $('connectBtn').onclick = () => {
      const id = $('peerIdInput').value.trim();
      if (!id) { alert('Bilgisayarın ID\'sini girin veya QR okutun'); return; }
      connectPairClient(id, receiver);
    };
    $('peerIdInput').onkeydown = (e) => {
      if (e.key === 'Enter') $('connectBtn').click();
    };

    Chat.bindInputs({
      canSend: () => WebRTC.getConn() && WebRTC.getConn().open,
      onText: (v) => {
        WebRTC.getConn().send({ type: 'text', text: v });
        Chat.addMsg(v, 'sent');
      },
      onFile: (f) => {
        FileTransfer.send(f, WebRTC.getConn()).catch(e => alert('Gönderim hatası: ' + e.message));
      }
    });
  }

  // Mobil pair client — host'a bağlan
  async function connectPairClient(hostId, receiver) {
    const $ = Utils.$;
    try {
      $('connectBtn').disabled = true;
      Utils.setStatus('Bağlanıyor…');
      if (!WebRTC.getPeer()) await WebRTC.init();
      const c = WebRTC.connect(hostId);
      WebRTC.setConn(c);

      c.on('open', () => {
        Utils.setStatus('Bağlı ✓', 'connected');
        const cv = $('connectView');
        if (cv) cv.classList.add('hidden');
        const chv = $('chatView');
        if (chv) chv.classList.remove('hidden');
        Chat.enableUI(true);
        Chat.addMsg('Bilgisayara bağlandınız. Uçtan uca şifreli.', 'system', null, { save: false });
      });

      wirePairConn(c, receiver);
    } catch (e) {
      alert('Bağlantı hatası: ' + e.message);
      $('connectBtn').disabled = false;
      Utils.setStatus('Hata', 'error');
    }
  }

  // ============================================================
  // ÖĞRENCI MODU (mobile.html?mode=student)
  // ============================================================
  function startStudent() {
    const $ = Utils.$;
    $('modeTitle').textContent = 'Öğrenci Modu';
    $('hintText').textContent = 'QR kodu okutabilir veya Hocanın ID\'sini girebilirsiniz.';

    if (!window.isSecureContext) {
      const n = $('deviceNotice');
      if (n) { n.style.display = 'block'; n.textContent = '⚠️ Kamera ve WebRTC için HTTPS gerekir.'; }
    }

    const receiver = new FileTransfer.Receiver();

    $('connectBtn').onclick = () => {
      const id = $('peerIdInput').value.trim();
      if (!id) { alert('ID girin'); return; }
      connectAsStudent(id, receiver);
    };
    $('peerIdInput').onkeydown = (e) => { if (e.key === 'Enter') $('connectBtn').click(); };

    Chat.bindInputs({
      canSend: () => WebRTC.getConn() && WebRTC.getConn().open,
      onText: (v) => {
        WebRTC.getConn().send({ type: 'text', text: v });
        Chat.addMsg(v, 'sent');
      },
      onFile: (f) => {
        FileTransfer.send(f, WebRTC.getConn()).catch(e => alert('Gönderim hatası: ' + e.message));
      }
    });
  }

  async function connectAsStudent(hostId, receiver) {
    const $ = Utils.$;
    try {
      $('connectBtn').disabled = true;
      Utils.setStatus('Bağlanıyor…');
      if (!WebRTC.getPeer()) await WebRTC.init();
      const c = WebRTC.connect(hostId);
      WebRTC.setConn(c);

      c.on('open', () => {
        Utils.setStatus('Bağlı ✓', 'connected');
        $('connectView').classList.add('hidden');
        $('chatView').classList.remove('hidden');
        Chat.enableUI(true);
        Chat.addMsg('Hocaya bağlandınız.', 'system', null, { save: false });
      });

      c.on('data', (data) => {
        switch (data.type) {
          case 'text':
            Chat.addMsg(data.text, 'received');
            break;
          case 'file-meta':
            receiver.start(data);
            Chat.addMsg(`📎 ${data.name} (${Utils.fmtSize(data.size)}) alınıyor…`, 'system', null, { save: false });
            Utils.showProgress('Alınıyor: ' + data.name, 0);
            break;
          case 'file-chunk':
            Utils.showProgress('Alınıyor: ' + receiver.name, receiver.addChunk(data.data));
            break;
          case 'file-end': {
            const blob = receiver.finalize();
            const html = FileTransfer.renderFileCard(blob, receiver.name, receiver.mime);
            Chat.addMsg('', 'received', html);
            Utils.showProgress('Tamamlandı ✓', 100, true);
            Utils.notify('Dosya alındı', receiver.name);
            break;
          }
        }
      });

      c.on('close', () => {
        Utils.setStatus('Bağlantı kesildi');
        Chat.enableUI(false);
        Chat.addMsg('Bağlantı kesildi.', 'system', null, { save: false });
        WebRTC.clearConn();
      });

      c.on('error', (e) => {
        console.error('[student] conn error', e);
        Utils.setStatus('Bağlantı hatası', 'error');
      });
    } catch (e) {
      alert('Bağlantı hatası: ' + e.message);
      $('connectBtn').disabled = false;
      Utils.setStatus('Hata', 'error');
    }
  }

  // ============================================================
  // GÜVENLİK AĞI: Kamera Butonunu Her Zaman Bağla
  // ============================================================
  function attachCameraHandler() {
    const scanBtn = document.getElementById('scanBtn');
    if (!scanBtn) return; // Masaüstünde yoksa çık
    if (scanBtn.dataset.attached === '1') return; // Zaten bağlanmışsa tekrar bağlama
    scanBtn.dataset.attached = '1';

    scanBtn.onclick = () => {
      if (!window.isSecureContext) {
        alert('Kamera için HTTPS gerekir');
        return;
      }
      const reader = document.getElementById('qrReader');
      const scan = document.getElementById('scanBtn');
      
      if (reader) reader.classList.remove('hidden');
      if (scan) scan.classList.add('hidden');

      const receiver = new FileTransfer.Receiver();
      
      QR.scan('qrReader',
        async (text) => {
          if (reader) reader.classList.add('hidden');
          if (scan) scan.classList.remove('hidden');
          
          // Hangi moddaysak o fonksiyona yönlendir
          if (mode === 'student') {
            await connectAsStudent(text, receiver);
          } else {
            await connectPairClient(text, receiver);
          }
        },
        (err) => {
          alert('Kamera erişilemedi: ' + (err.message || err));
          if (reader) reader.classList.add('hidden');
          if (scan) scan.classList.remove('hidden');
        }
      );
    };
  }

  // DOM hazır olduğunda kamera butonunu bağla
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachCameraHandler);
  } else {
    attachCameraHandler();
  }

  // ============================================================
  // ROUTER
  // ============================================================
  if (mode === 'teacher') {
    Broadcast.start();
  } else if (mode === 'student') {
    startStudent();
  } else {
    // mode === 'pair'
    if (!isDesktopPage) {
      startPairMobile(); // mobile.html
    } else {
      startPair();       // desktop.html
    }
  }
})();