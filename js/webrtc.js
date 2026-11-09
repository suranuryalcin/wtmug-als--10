/* ============================================================
   webrtc.js — PeerJS bağlantı yönetimi + QoS
   ============================================================ */
'use strict';

window.WebRTC = (function () {

  let peer = null;
  let conn = null;
  let qosTimer = null;

  /**
   * Peer açar. Özel ID verilirse onu kullanır.
   * @param {string} [customId]
   * @returns {Promise<string>}
   */
  function init(customId) {
    return new Promise((resolve, reject) => {
      try {
        peer = customId ? new Peer(customId) : new Peer();
      } catch (e) {
        return reject(e);
      }
      let settled = false;

      peer.on('open', (id) => {
        if (!settled) { settled = true; resolve(id); }
      });

      peer.on('error', (e) => {
        console.error('[WebRTC] peer error:', e);
        if (!settled) { settled = true; reject(e); return; }
        if (e.type === 'peer-unavailable') {
          Utils.setStatus('Karşı taraf bulunamadı', 'error');
        } else if (e.type === 'network' || e.type === 'server-error') {
          Utils.setStatus('Sunucu hatası', 'error');
        }
      });

      peer.on('disconnected', () => {
        Utils.setStatus('Signaling koptu, yeniden bağlanıyor…');
        try { peer.reconnect(); } catch (e) { }
      });

      setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('PeerJS zaman aşımı')); }
      }, 15000);
    });
  }

  function getPeer() { return peer; }

  /**
   * Peer'a gelen bağlantıları dinler.
   * @param {(conn)=>void} handler
   */
  function onIncoming(handler) {
    if (peer) peer.on('connection', handler);
  }

  /**
   * Bir host ID'sine bağlanır.
   */
  function connect(hostId, opts) {
    if (!peer) throw new Error('Peer yok');
    conn = peer.connect(hostId, Object.assign({ reliable: true }, opts || {}));
    return conn;
  }

  function setConn(c) { conn = c; }
  function getConn() { return conn; }
  function clearConn() { conn = null; }

  /**
   * DataChannel QoS (RTT) göstergesi.
   */
  function startQoS(c) {
    const badge = Utils.$('qosBadge');
    if (badge) badge.classList.remove('hidden');
    if (qosTimer) clearInterval(qosTimer);
    qosTimer = setInterval(async () => {
      if (!c || !c.open || !c.dataChannel) return;
      try {
        const stats = await new Promise((res) => {
          c.dataChannel.getStats((s) => res(s));
        });
        let rtt = '—';
        stats.forEach((s) => {
          if (s.type === 'candidate-pair' && s.state === 'succeeded'
            && s.currentRoundTripTime !== undefined) {
            rtt = Math.round(s.currentRoundTripTime * 1000) + ' ms';
          }
        });
        if (badge) badge.textContent = 'RTT: ' + rtt;
      } catch (e) { }
    }, 3000);
  }

  function stopQoS() {
    if (qosTimer) clearInterval(qosTimer);
    qosTimer = null;
    const badge = Utils.$('qosBadge');
    if (badge) badge.classList.add('hidden');
  }

  function destroy() {
    stopQoS();
    try { if (conn) conn.close(); } catch (e) { }
    try { if (peer) peer.destroy(); } catch (e) { }
    conn = null;
    peer = null;
  }

  window.addEventListener('beforeunload', () => {
    try { if (conn) conn.close(); } catch (e) { }
  });

  return {
    init, getPeer, onIncoming, connect,
    setConn, getConn, clearConn,
    startQoS, stopQoS, destroy
  };
})();