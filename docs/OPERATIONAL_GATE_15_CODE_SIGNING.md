# Operational Gate 15: Windows Desktop EV Authenticode Code Signing

## 1. Context & Purpose
When packaging the OHMS desktop application via **Tauri 2** for Windows workstations (`.msi` or `.exe`), Windows SmartScreen displays an "Unknown Publisher" warning unless the installer is signed with an EV (Extended Validation) Authenticode Certificate.

---

## 2. EV Code Signing Setup Procedure

### Step 1: Procure an Authenticode Certificate
Procure a Windows Code Signing certificate from an authorized Certificate Authority:
- DigiCert, Sectigo, or SSL.com (Supports Cloud HSM / eSigner for automated CI builds).

### Step 2: Configure Tauri Desktop Signing
In `src-tauri/tauri.conf.json`:
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERTIFICATE_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

Or pass via environment variable during `npm run desktop:build`:
```bash
$env:TAURI_SIGNING_PRIVATE_KEY="<private-key>"
npm run desktop:build
```
