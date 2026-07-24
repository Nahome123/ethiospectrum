import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getDocumentSummarySecret } from "@/lib/env/server";

/** The summary worker uses a distinct invocation secret from document processing. */
export function hasValidDocumentSummarySecret(candidate: string | null): boolean {
  if (!candidate) return false;
  const expectedSecret = getDocumentSummarySecret();
  if (!expectedSecret) return false;
  const expected = Buffer.from(expectedSecret, "utf8");
  const received = Buffer.from(candidate, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
