/* ============================================================
   qrcode.js — QR üretme ve okuma sarmalayıcısı
   Bağımlılıklar (HTML'de yüklenir):
     - qrcode-generator (üretim)
     - html5-qrcode (okuma, sadece mobil)
   ============================================================ */
'use strict';

window.QR = (function () {

  /**
   * Canvas üzerine QR çizer.
   * @param {HTMLCanvasElement} canvas
   * @param {string} text
   */
  function draw(canvas, text) {
    if (!canvas || typeof qrcode === 'undefined') return;
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const count = qr.getModuleCount();
    const cell = size / count;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }

  /**
   * Kamerayı açar ve QR okur.
   * @param {string} elementId — video yerleştirilecek DOM id
   * @param {(text:string)=>void} onResult
   * @param {(err:Error)=>void} [onError]
   * @returns {object} { stop() }
   */
  function scan(elementId, onResult, onError) {
    if (typeof Html5Qrcode === 'undefined') {
      if (onError) onError(new Error('QR kütüphanesi yüklenemedi'));
      return { stop() { } };
    }
    const scanner = new Html5Qrcode(elementId);
    let stopped = false;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 250 },
      async (text) => {
        if (stopped) return;
        stopped = true;
        try { await scanner.stop(); scanner.clear(); } catch (e) { }
        onResult(text);
      },
      () => { /* her frame'de hata olabilir, yok say */ }
    ).catch((e) => {
      if (onError) onError(e);
    });

    return {
      stop() {
        if (stopped) return;
        stopped = true;
        scanner.stop().then(() => scanner.clear()).catch(() => { });
      }
    };
  }

  return { draw, scan };
})();