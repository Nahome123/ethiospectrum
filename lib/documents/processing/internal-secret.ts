import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getDocumentProcessingSecret } from "@/lib/env/server";

export function hasValidDocumentProcessingSecret(candidate: string | null): boolean {
  if (!candidate) return false;
  const expectedSecret = getDocumentProcessingSecret();
  if (!expectedSecret) return false;
  const expected = Buffer.from(expectedSecret, "utf8");
  const received = Buffer.from(candidate, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
