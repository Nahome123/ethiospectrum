import { NextResponse } from "next/server";
import { hasValidDocumentOcrSecret } from "@/lib/documents/ocr/internal-secret";
import { runDocumentOcrBatch } from "@/lib/documents/ocr/runner";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return new NextResponse(null, { status: 401 });
}

function unavailableResponse() {
  return new NextResponse(null, { status: 503 });
}

/** Protected scheduler entry point. It accepts no document identifiers or body. */
export async function POST(request: Request) {
  let authorized: boolean;
  try {
    authorized = hasValidDocumentOcrSecret(request.headers.get("x-document-ocr-secret"));
  } catch {
    return unavailableResponse();
  }
  if (!authorized) return unauthorizedResponse();

  try {
    const result = await runDocumentOcrBatch();
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Document OCR is temporarily unavailable." }, { status: 503 });
  }
}
