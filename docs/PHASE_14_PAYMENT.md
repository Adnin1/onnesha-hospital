# Phase 14: Payment Gateway & Online Settlement Engine

## 1. Supported Bangladesh Gateways
- **bKash Tokenized Checkout (v1.2.0-beta)**
- **Nagad Direct Merchant PG API (v-0.2.0)**
- **SSLCommerz Payment Gateway (v4 Session & Order Validation API)**

## 2. Server-Side Amount Invariant
The server ALWAYS queries the database for the invoice (`invoices.due_amount`) and authoritative currency (`BDT`). The client browser is **never** permitted to supply or alter the payable amount, invoice identity, or currency.

## 3. Atomic Database Settlement RPC
Execution of `verify_and_record_online_payment(...)` in PostgreSQL guarantees:
1. Locks invoice row with `FOR UPDATE`.
2. Validates `payment_intents.status == 'PROCESSING'`.
3. Checks that settlement amount does not exceed current `due_amount`.
4. Generates atomic receipt sequence `RCP-YYYYMM-XXXXX`.
5. Inserts confirmed row into `payments`.
6. Deducts `due_amount` and advances invoice to `PAID` or `PARTIAL`.
7. Transitions intent to `SUCCEEDED`.
