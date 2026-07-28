import { NextResponse } from "next/server";
import { hasValidDocumentQuestionSecret } from "@/lib/documents/questions/internal-secret";
import { runDocumentQuestionBatch } from "@/lib/documents/questions/runner";

export const runtime = "nodejs";

/** Protected scheduler entry point. It receives no document ID, question, or body contract. */
export async function POST(request: Request) {
  let authorized: boolean;
  try {
    authorized = hasValidDocumentQuestionSecret(request.headers.get("x-document-question-secret"));
  } catch {
    return new NextResponse(null, { status: 503 });
  }
  if (!authorized) return new NextResponse(null, { status: 401 });
  try {
    return NextResponse.json(await runDocumentQuestionBatch(), { status: 200 });
  } catch {
    return NextResponse.json({ error: "Document questions are temporarily unavailable." }, { status: 503 });
  }
}
