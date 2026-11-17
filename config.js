// rtl_tcp web receiver - settings
window.RTL_CONFIG = {
  rtlTcp: { host: "193.24.208.6", port: 1240 },
  
  // Permanent Fly.io cloud bridge WebSocket address
  wsUrl: "wss://websdr-rosy-inlet-772.fly.dev",

  stationLocation: "Budapest, Hungary",
  operator: "michaelnxdstan",

  frequencyMHz: 10.1,      // start frequency (0 - 30 MHz)
  mode: "am",              // "am" | "nfm" | "wfm" | "usb" | "lsb"
  sampleRate: 1200000,     // 1.2 MS/s
  gainMode: "auto",        // "auto" | "manual"
  gainDb: 0,
  ppm: 0,
  volume: 0.7,
  deemphasisUs: 50,
  autoConnect: true
};
