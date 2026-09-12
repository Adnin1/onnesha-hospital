/**
 * Idempotency Architecture for Critical Hospital Mutations
 * Prevents double billing, duplicate appointments, and duplicate stock debits.
 */

export interface IdempotencyRecord<T = unknown> {
  key: string;
  operation: string;
  status: "pending" | "completed" | "failed";
  response?: T;
  createdAt: string;
}

const memoryStore = new Map<string, IdempotencyRecord>();

/**
 * Validates or records an idempotency key before running a sensitive mutation.
 */
export async function withIdempotency<T>(
  idempotencyKey: string,
  operation: string,
  fn: () => Promise<T>
): Promise<{ result: T; wasCached: boolean }> {
  if (!idempotencyKey) {
    const freshResult = await fn();
    return { result: freshResult, wasCached: false };
  }

  const existing = memoryStore.get(idempotencyKey);
  if (existing && existing.status === "completed") {
    return { result: existing.response as T, wasCached: true };
  }

  if (existing && existing.status === "pending") {
    throw new Error("Concurrent mutation already in progress for this idempotency key.");
  }

  // Mark pending
  memoryStore.set(idempotencyKey, {
    key: idempotencyKey,
    operation,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  try {
    const result = await fn();
    memoryStore.set(idempotencyKey, {
      key: idempotencyKey,
      operation,
      status: "completed",
      response: result,
      createdAt: new Date().toISOString(),
    });
    return { result, wasCached: false };
  } catch (err) {
    memoryStore.delete(idempotencyKey);
    throw err;
  }
}
