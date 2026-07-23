import { NextResponse } from "next/server";
import { hasValidDocumentProcessingSecret } from "@/lib/documents/processing/internal-secret";
import { runDocumentProcessingBatch } from "@/lib/documents/processing/runner";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return new NextResponse(null, { status: 401 });
}

function unavailableResponse() {
  return new NextResponse(null, { status: 503 });
}

/** Protected scheduler/platform entry point. It accepts no document identifiers. */
export async function POST(request: Request) {
  let authorized: boolean;
  try {
    authorized = hasValidDocumentProcessingSecret(request.headers.get("x-document-processing-secret"));
  } catch {
    return unavailableResponse();
  }
  if (!authorized) {
    return unauthorizedResponse();
  }

  try {
    const result = await runDocumentProcessingBatch();
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Document processing is temporarily unavailable." }, { status: 503 });
  }
}
