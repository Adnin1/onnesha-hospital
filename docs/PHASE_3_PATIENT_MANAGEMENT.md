# Phase 3: Patient Master Index & Patient Management

## 1. Executive Summary
The Patient Master Index (PMI) is the foundational identity architecture of the Onnesha Hospital Management System (OHMS). Designed specifically for healthcare operations in Bangladesh, it guarantees deterministic patient identification, prevents dangerous patient duplicate fragmentation, and normalizes phone numbers across all domestic carriers.

---

## 2. Core Identity & Numbering Architecture

### 2.1 Atomic Unique Identifier Sequence
Every patient registered in OHMS receives an enterprise-grade unique code with the format:
`P-YYYYMM-XXXXX` (e.g., `P-202609-00001`).

```sql
CREATE OR REPLACE FUNCTION generate_patient_code(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_seq INT;
  v_code TEXT;
BEGIN
  v_prefix := 'P-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-';
  v_seq := nextval('patient_code_seq');
  v_code := v_prefix || LPAD(v_seq::TEXT, 5, '0');
  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2.2 Bangladesh Mobile Number Canonicalization
Domestic patient registrations frequently present phone numbers with erratic international dialing codes (`+880`, `0088`, `880`), irregular hyphenation, or spaces.
The `normalizeBDPhone` engine converts any valid domestic input into an 11-digit canonical form:
`01[3-9]\d{8}` (e.g., `01712345678`).

| Input String | Canonical Form | Operator Network | Validity |
|:---|:---|:---|:---|
| `+8801712-345678` | `01712345678` | Grameenphone | Valid |
| `880 1819 998877` | `01819998877` | Robi / Airtel | Valid |
| `01911-000000` | `01911000000` | Banglalink | Valid |
| `01552000000` | `01552000000` | Teletalk | Valid |
| `01300123456` | `01300123456` | GP Skitto | Valid |
| `01200000000` | `01200000000` | Invalid Prefix | Rejected |

Stored in the database under `patients.normalized_phone` with a specialized btree index:
```sql
CREATE INDEX IF NOT EXISTS idx_patients_normalized_phone 
ON patients(organization_id, normalized_phone);
```

---

## 3. Duplicate Detection Engine

### 3.1 Multi-Signal Scoring Matrix
To balance between catching accidental duplicate charts and allowing legitimate shared phone numbers (e.g., family members, pediatric cases, elderly guardians), OHMS evaluates three confidence tiers:

1. **HIGH Confidence (Probable Duplicate Chart)**:
   - Exact National ID (NID) match within the organization.
   - OR same normalized phone number **AND** name similarity score $\ge 0.70$ (Dice's Bigram Coefficient).
   - *System Behavior*: Issues strong blocking warning with option to inspect candidate.

2. **MEDIUM Confidence (Potential Family Member / Shared Phone)**:
   - Same normalized phone number, but name similarity score $< 0.70$.
   - Common in rural and peri-urban clinics where a single household phone registers parents and children.
   - *System Behavior*: Displays yellow alert acknowledging shared phone number.

3. **LOW Confidence**:
   - Partial name overlap without matching phone, NID, or date of birth.

### 3.2 Bigram Dice Coefficient Formula
$$\text{Similarity}(S_1, S_2) = \frac{2 \times |B_1 \cap B_2|}{|B_1| + |B_2|}$$
Where $B_1$ and $B_2$ represent the set of character bigrams of strings $S_1$ and $S_2$.

---

## 4. Patient Merge Protocol
When duplicates are inadvertently created (e.g., during emergency admissions), authorized Medical Records Officers can request a chart merge:
- `patient_merge_requests` records `source_patient_id` and `target_patient_id`.
- Reassigns historical visits, invoices, lab orders, pharmacy dispensations, and vitals.
- Retains full immutable audit trail in `audit_logs`.
