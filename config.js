// Shared by server.js (Node) and index.html (browser).
(function (root, make) {
  const cfg = make();
  if (typeof module === 'object' && module.exports) module.exports = cfg;
  else root.CONFIG = cfg;
})(this, () => ({
  RTL_HOST: '193.24.208.6',   // machine running rtl_tcp
  RTL_PORT: 1240,
  WS_URL: 'wss://tomatoes-publishers-why-facilitate.trycloudflare.com', // your cloudflared URL (use wss://)
  WS_PORT: 8080,              // local port server.js listens on
  SAMPLE_RATE: 1024000,       // must be a valid rtl_tcp rate
  CENTER_FREQ: 7100000,       // Hz, receive frequency (before upconverter)
  GAIN: null,                 // null = auto, or dB (e.g. 28.0)
  MIN_FREQ: 0,                // Hz, lower tuning limit
  MAX_FREQ: 30000000,         // Hz, upper tuning limit (HF only)
  UPCONVERTER: 0,             // Hz added to the tuner frequency (e.g. 125000000 for Ham It Up)
}));