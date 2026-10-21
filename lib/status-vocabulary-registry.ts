/**
 * =====================================================================================
 * OHMS STATUS VOCABULARY REGISTRY (CANONICAL STATUS DEFINITIONS)
 * =====================================================================================
 * This file serves as the Single Source of Truth for all database status enums & strings.
 * Neither UI code nor backend actions may invent ad-hoc status literals.
 * =====================================================================================
 */

export const BED_STATUSES = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING', 'VACANT'] as const;
export type BedStatus = typeof BED_STATUSES[number];

export const CABIN_STATUSES = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING', 'VACANT'] as const;
export type CabinStatus = typeof CABIN_STATUSES[number];

export const BED_ASSIGNMENT_STATUSES = ['ACTIVE', 'TRANSFERRED', 'DISCHARGED', 'VACATED'] as const;
export type BedAssignmentStatus = typeof BED_ASSIGNMENT_STATUSES[number];

export const VISIT_STATUSES = ['ADMITTED', 'DISCHARGED', 'TRANSFERRED', 'CANCELLED'] as const;
export type VisitStatus = typeof VISIT_STATUSES[number];

export const QUEUE_STATUSES = ['WAITING', 'CALLED', 'IN_ROOM', 'COMPLETED', 'SKIPPED'] as const;
export type QueueStatus = typeof QUEUE_STATUSES[number];

export const INVOICE_STATUSES = ['DRAFT', 'PENDING', 'PAID', 'PARTIALLY_PAID', 'VOID', 'CANCELLED'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

export const PAYMENT_STATUSES = ['SUCCESS', 'PENDING', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export const BLOOD_BAG_STATUSES = ['AVAILABLE', 'RESERVED', 'TRANSFUSED', 'EXPIRED', 'DISCARDED'] as const;
export type BloodBagStatus = typeof BLOOD_BAG_STATUSES[number];

export const TRANSFUSION_STATUSES = ['COMPLETED', 'IN_PROGRESS', 'REACTION', 'VOIDED', 'CANCELLED'] as const;
export type TransfusionStatus = typeof TRANSFUSION_STATUSES[number];

export const REFERRAL_STATUSES = ['PENDING', 'APPROVED', 'SETTLED', 'REJECTED'] as const;
export type ReferralStatus = typeof REFERRAL_STATUSES[number];

export const EXPENSE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'PAID', 'REJECTED', 'VOIDED'] as const;
export type ExpenseStatus = typeof EXPENSE_STATUSES[number];

/**
 * Universal validator helper to verify if an arbitrary status string conforms to canonical registry
 */
export function isValidStatus<T extends string>(status: string, allowedList: readonly T[]): status is T {
  if (!status) return false;
  return (allowedList as readonly string[]).includes(status.toUpperCase().trim());
}

export const STATUS_REGISTRY = {
  BED: BED_STATUSES,
  CABIN: CABIN_STATUSES,
  BED_ASSIGNMENT: BED_ASSIGNMENT_STATUSES,
  VISIT: VISIT_STATUSES,
  QUEUE: QUEUE_STATUSES,
  INVOICE: INVOICE_STATUSES,
  PAYMENT: PAYMENT_STATUSES,
  BLOOD_BAG: BLOOD_BAG_STATUSES,
  TRANSFUSION: TRANSFUSION_STATUSES,
  REFERRAL: REFERRAL_STATUSES,
  EXPENSE: EXPENSE_STATUSES,
} as const;
