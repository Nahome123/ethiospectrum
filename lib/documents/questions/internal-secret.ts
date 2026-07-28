import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getDocumentQuestionSecret } from "@/lib/env/server";

/** The question worker has an invocation secret independent from all other workers. */
export function hasValidDocumentQuestionSecret(candidate: string | null): boolean {
  if (!candidate) return false;
  const expectedSecret = getDocumentQuestionSecret();
  if (!expectedSecret) return false;
  const expected = Buffer.from(expectedSecret, "utf8");
  const received = Buffer.from(candidate, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
