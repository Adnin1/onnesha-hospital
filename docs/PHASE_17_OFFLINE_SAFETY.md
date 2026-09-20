# Phase 17 — Offline Safety

## Design Principle
Hospital staff may have unstable internet. The system provides a safe degraded experience without ever faking clinical or financial success.

## Implementation

### NetworkStatus Component (`components/app/NetworkStatus.tsx`)
- Detects `navigator.onLine` state
- Shows persistent red banner when offline: "আপনি অফলাইন আছেন। ক্লিনিক্যাল ও আর্থিক ডেটা সেভ করতে ইন্টারনেট সংযোগ প্রয়োজন।"
- Auto-hides when connection restored
- Uses `role="alert"` and `aria-live="assertive"` for screen readers
- Dismissible but re-appears on next offline event

### Write Operation Safety
- Patient registration: Server confirmation mandatory
- Prescription creation: Server confirmation mandatory
- Payment/invoice: Server confirmation mandatory
- Admission/discharge: Server confirmation mandatory
- Lab results: Server confirmation mandatory
- **If network fails**: Error shown clearly — "সেভ হয়নি"
- **Form values**: Preserved in React state (not persisted to storage)
- **Retry**: Available via retry button on error

### What Works Offline
- Cached static app shell (via service worker)
- Previously visited public pages
- PWA icon, manifest, static assets

### What Does NOT Work Offline
- Any clinical data read/write
- Any financial transaction
- Authentication
- Real-time queue/token
- Notifications
- Audit logging
