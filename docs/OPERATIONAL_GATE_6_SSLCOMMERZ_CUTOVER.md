# Operational Gate 6: SSLCommerz Production Live Cutover

## 1. Context & Purpose
OHMS supports Bangladesh online patient payments (bKash, Nagad, Rocket, Upay, Visa, Mastercard, DBBL Nexus) through SSLCommerz. The system currently defaults to sandbox simulation mode for developer safety.

---

## 2. Production Cutover Procedure

### Step 1: Obtain Production Merchant Credentials from SSLCommerz
1. Complete merchant registration and agreement with SSLCommerz (https://sslcommerz.com).
2. Receive your official **Store ID** (e.g. `onneshahospital_live`) and **Store Password**.

### Step 2: Configure Production Environment Variables in Cloudflare Pages
1. Go to Cloudflare Dashboard -> **Workers & Pages** -> **onnesha-hospital** -> **Settings** -> **Environment variables**.
2. Set the following environment variables:
   ```env
   SSLCOMMERZ_STORE_ID="<YOUR_LIVE_STORE_ID>"
   SSLCOMMERZ_STORE_PASSWORD="<YOUR_LIVE_STORE_PASSWORD>"
   SSLCOMMERZ_IS_SANDBOX="false"
   ```
3. Set the live base URL:
   ```env
   NEXT_PUBLIC_APP_URL="https://onnesha-hospital.pages.dev"
   ```

### Step 3: IPN & Webhook Verification
- Ensure SSLCommerz IPN (Instant Payment Notification) URL is set to:
  `https://onnesha-hospital.pages.dev/api/payments/sslcommerz/ipn`
- The system automatically reconciles incoming IPN notifications and validates store transaction hashes before marking bills as PAID.
