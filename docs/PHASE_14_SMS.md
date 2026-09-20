# Phase 14: Bangladesh SMS Gateway Specification

## 1. Supported Telecom Gateways
- **SSL Wireless (SMS Plus)**
- **Greenweb BD**
- **Elitbuzz Technologies**

## 2. Phone Number Canonicalization
All mobile phone numbers pass through `normalizeBDPhone()` in `lib/patient/phone.ts`:
- Input forms accepted: `01XXXXXXXXX`, `8801XXXXXXXXX`, `+880 1XXX-XXXXXX`.
- Normalized local canonical: `01XXXXXXXXX` (11 digits, regex `/^01[3-9]\d{8}$/`).
- International API format: `8801XXXXXXXXX` (prepended `88` for gateway HTTP POST).

## 3. Supported Message Types
- `APPOINTMENT_CONFIRMED`
- `APPOINTMENT_REMINDER`
- `TOKEN_ASSIGNED`
- `BILL_RECEIPT`
- `PAYMENT_FAILED`
- `DUE_REMINDER`
- `REPORT_READY`
- `ADMISSION_NOTICE`
- `DISCHARGE_NOTICE`
- `OTP`

## 4. Privacy & PHI Restrictions
- Full diagnostic labels, pathology findings, and prescription details are strictly prohibited from SMS payloads.
- Report ready messages instruct the patient to securely log into the patient portal to view verified results.
