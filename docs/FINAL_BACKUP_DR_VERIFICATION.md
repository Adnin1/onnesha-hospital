# Final Backup & Disaster Recovery (DR) Verification Report

> [!IMPORTANT]
> **DISASTER RECOVERY POLICY:** This document details the managed database backup configuration, disaster recovery protocol, RPO/RTO metrics, and emergency data restoration procedures for Onnesha Hospital.

---

## 1. Backup & Recovery Metrics

| Metric | Target Value | Implementation & Managed Infrastructure |
| :--- | :--- | :--- |
| **Recovery Point Objective (RPO)** | < 5 Minutes | Supabase Managed Point-in-Time Recovery (PITR) & Continuous WAL Archiving. |
| **Recovery Time Objective (RTO)** | < 1 Hour | Database snapshot restoration protocol via Supabase Cloud Console / CLI. |
| **Daily Automated Backups** | Daily at 02:00 UTC | Managed physical database backup retained for 30 days. |
| **Disaster Recovery Location** | Multi-region storage | Automated offsite database snapshot replication. |

---

## 2. Emergency Database Restoration Protocol

1. **Initiate Incident Response:** Log operational incident and switch application to maintenance notice if needed.
2. **Access Supabase Console:** Navigate to **Project Settings** → **Database** → **Backups**.
3. **Select Restore Point:** Choose either PITR timestamp or the latest valid daily snapshot prior to corruption.
4. **Restore Database:** Execute restore onto project instance or temporary DR instance.
5. **Verify Data Integrity:** Run automated test suite (`npm test`) and inspect recent financial and clinical logs to confirm full integrity before reopening system access.
