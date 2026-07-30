import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getReminderWorkerSecret } from "@/lib/env/server";

export function hasValidReminderWorkerSecret(candidate: string | null): boolean {
  const expected = getReminderWorkerSecret();
  if (!candidate || !expected) return false;
  const receivedBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
