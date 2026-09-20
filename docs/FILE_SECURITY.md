# SECURE FILE & SENSITIVE EMR STORAGE ARCHITECTURE
**Project:** Onnesha Hospital Management System (OHMS)  
**Storage Engine:** Supabase Storage (S3-compatible, encrypted at rest)  

---

## 1. Bucket Isolation & Privacy Policies

| Bucket Identifier | Scope | Public Access | Target Assets | Access Mechanism |
| :--- | :--- | :---: | :--- | :--- |
| `hospital-public` | Public | **YES** | Hospital branding, logos, doctor profile photos, department banners. | Direct CDN URLs via Cloudflare. |
| `patient-documents` | Private | **NO** | Patient NID scans, previous medical records, clinical file attachments. | Time-limited Signed URLs (TTL: 15 minutes) issued only to authenticated clinical staff. |
| `diagnostic-reports` | Private | **NO** | X-Ray digital DICOM/JPEG, USG imaging scans, authorized lab report PDFs. | Time-limited Signed URLs issued strictly upon authorization verification. |

---

## 2. Row Level Security on Storage Objects

```sql
-- Enforce that patient documents can only be accessed by staff belonging to the owning organization
CREATE POLICY "Tenant Isolated Patient File Access"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'patient-documents'
  AND (storage.foldername(name))[1] = get_current_org_id()::text
);
```
Private files are never delivered via raw public bucket URLs.
