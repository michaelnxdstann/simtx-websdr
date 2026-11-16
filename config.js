// rtl_tcp web receiver - settings
window.RTL_CONFIG = {
  // Your rtl_tcp server (raw TCP; browsers can't talk to this directly).
  rtlTcp: { host: "193.24.208.6", port: 1240 },

  // WebSocket address the page actually connects to via the active Serveo tunnel.
  wsUrl: "wss://5584d2bdb7f5ff51-182-11-129-113.serveousercontent.com",

  stationLocation: "Budapest, Hungary",  // shown in the info text at the top
  operator: "michaelnxdstan",

  frequencyMHz: 10.1,      // start frequency (receiver is limited to 0 - 30 MHz)
  mode: "am",              // "am" | "nfm" | "wfm"
  sampleRate: 1200000,     // 1.2 MS/s works well for all modes
  gainMode: "auto",        // "auto" | "manual"
  gainDb: 30,              // used when gainMode is "manual"
  ppm: 0,                  // frequency correction
  volume: 0.7,             // 0 - 1
  deemphasisUs: 50         // 50 (Europe/Asia) or 75 (Americas) for wfm
};
```[cite: 3]

Just save the file, commit and push the change to your GitHub repository, and your GitHub Pages site will use that tunnel address.
