/* ============================================================
   filetransfer.js — Dosya parçalama/birleştirme, gönderme, alma
   ============================================================ */
'use strict';

window.FileTransfer = (function () {

  /**
   * Dosyayı parçalayarak gönderir.
   * @param {File|Blob} file
   * @param {DataConnection} conn
   * @param {object} [opts] {onProgress, relayId, silent}
   */
  async function send(file, conn, opts) {
    opts = opts || {};
    if (!conn || !conn.open) throw new Error('Bağlantı yok');

    const total = Math.ceil(file.size / Utils.CHUNK);
    const relayId = opts.relayId || null;
    const name = file.name || 'dosya';
    const mime = file.type || 'application/octet-stream';

    const meta = { type: 'file-meta', name, size: file.size, mime, total };
    if (relayId) meta.relayId = relayId;
    conn.send(meta);

    const reader = new FileReader();
    const readSlice = (start, end) => new Promise((res, rej) => {
      reader.onload = (e) => res(e.target.result);
      reader.onerror = rej;
      reader.readAsArrayBuffer(file.slice(start, end));
    });

    let offset = 0;
    let idx = 0;

    while (offset < file.size) {
      if (!conn.open) break;

      // Backpressure
      if (conn.dataChannel) {
        while (conn.dataChannel.bufferedAmount > Utils.MAX_BUFFER) {
          await new Promise(r => setTimeout(r, 20));
        }
      }

      try {
        const data = await readSlice(offset, offset + Utils.CHUNK);
        const chunk = { type: 'file-chunk', index: idx, data };
        if (relayId) chunk.relayId = relayId;
        conn.send(chunk);

        idx++;
        offset += Utils.CHUNK;
        const pct = Math.min(100, Math.round((offset / file.size) * 100));

        if (opts.onProgress) opts.onProgress(pct);
        else if (!opts.silent) Utils.showProgress('Gönderiliyor: ' + name, pct);
      } catch (e) {
        console.error('[FileTransfer] chunk hatası', e);
        break;
      }
    }

    const end = { type: 'file-end' };
    if (relayId) end.relayId = relayId;
    conn.send(end);

    if (opts.onProgress) opts.onProgress(100);
    else if (!opts.silent) Utils.showProgress('Tamamlandı: ' + name, 100, true);
  }

  /**
   * Alıcı tarafında parçaları biriktirir.
   */
  class Receiver {
    constructor() {
      this.chunks = [];
      this.name = '';
      this.size = 0;
      this.mime = '';
      this.total = 0;
      this.received = 0;
      this.relayId = null;
      this.from = null;
    }

    start(meta, from) {
      this.chunks = [];
      this.name = meta.name;
      this.size = meta.size;
      this.mime = meta.mime || 'application/octet-stream';
      this.total = meta.total;
      this.received = 0;
      this.relayId = meta.relayId || null;
      this.from = from || null;
    }

    addChunk(data) {
      this.chunks.push(data);
      this.received++;
      return Math.min(100, Math.round((this.received / this.total) * 100));
    }

    finalize() {
      const blob = new Blob(this.chunks, { type: this.mime });
      this.chunks = [];
      return blob;
    }
  }

  /**
   * Blob'u sohbet kartı HTML'ine dönüştürür.
   */
  function renderFileCard(blob, name, mime, from) {
    const url = URL.createObjectURL(blob);
    const isImg = mime.startsWith('image/');
    const isVid = mime.startsWith('video/');
    const isAud = mime.startsWith('audio/');
    let html = `📎 <b>${name}</b>`;
    if (from) html += ` <i>(${from})</i>`;
    html += `<div class="file-meta">${Utils.fmtSize(blob.size)}</div>`;
    if (isImg) html += `<img class="file-preview" src="${url}" alt="${name}">`;
    if (isVid) html += `<video class="file-preview" src="${url}" controls></video>`;
    if (isAud) html += `<audio src="${url}" controls style="width:100%;margin-top:6px"></audio>`;
    html += `<a class="file-link" href="${url}" download="${name}">⬇ İndir</a>`;
    return html;
  }

  return { send, Receiver, renderFileCard };
})();