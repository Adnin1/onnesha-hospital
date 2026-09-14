# FINAL DATA FLOW

## E2E Hospital Data Flow
1. **Appointment**: Patient books online or via receptionist.
2. **Registration**: Receptionist converts appointment to a registered visit.
3. **OPD/Triage**: Nurse captures vitals.
4. **Consultation**: Doctor records clinical notes and issues e-prescriptions & lab orders.
5. **Lab**: Lab tech collects samples, processes, and enters verified results.
6. **Pharmacy**: Pharmacist dispenses medications, inventory automatically decrements.
7. **Billing**: Centralized billing calculates total dues based on consultations, labs, and pharmacy.
8. **Payment**: Cashier receives payment, issues receipt.
