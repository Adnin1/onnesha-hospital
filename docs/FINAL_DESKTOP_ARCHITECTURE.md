# FINAL DESKTOP ARCHITECTURE

## Tauri 2 Windows Desktop Software
- **Core Engine**: Tauri 2 (Rust)
- **Webview**: WebView2 (Edge Chromium) for Windows
- **Integration**: Shared single-origin backend with the web application
- **Offline Capabilities**: Local caching for specific read-only data, though requires network for transactions.
- **Printing**: Direct integration with Windows print spooler for A4 and POS Thermal 80mm printers.
