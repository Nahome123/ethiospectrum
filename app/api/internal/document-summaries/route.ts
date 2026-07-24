import { NextResponse } from "next/server";
import { hasValidDocumentSummarySecret } from "@/lib/documents/summaries/internal-secret";
import { runDocumentSummaryBatch } from "@/lib/documents/summaries/runner";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return new NextResponse(null, { status: 401 });
}

function unavailableResponse() {
  return new NextResponse(null, { status: 503 });
}

/** Protected scheduler/platform entry point. It accepts no document or summary identifiers. */
export async function POST(request: Request) {
  let authorized: boolean;
  try {
    authorized = hasValidDocumentSummarySecret(request.headers.get("x-document-summary-secret"));
  } catch {
    return unavailableResponse();
  }
  if (!authorized) return unauthorizedResponse();

  try {
    return NextResponse.json(await runDocumentSummaryBatch(), { status: 200 });
  } catch {
    return NextResponse.json({ error: "Document summaries are temporarily unavailable." }, { status: 503 });
  }
}
