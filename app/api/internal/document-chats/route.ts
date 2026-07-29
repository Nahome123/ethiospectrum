import { NextResponse } from "next/server";
import { hasValidDocumentQuestionSecret } from "@/lib/documents/questions/internal-secret";
import { runDocumentChatBatch } from "@/lib/documents/chat/runner";

export const runtime = "nodejs";

/** ETH-019 reuses the question worker secret and accepts no chat-specific input. */
export async function POST(request: Request) {
  let authorized: boolean;
  try {
    authorized = hasValidDocumentQuestionSecret(request.headers.get("x-document-question-secret"));
  } catch {
    return new NextResponse(null, { status: 503 });
  }
  if (!authorized) return new NextResponse(null, { status: 401 });
  try {
    return NextResponse.json(await runDocumentChatBatch(), { status: 200 });
  } catch {
    return NextResponse.json({ error: "Document chat is temporarily unavailable." }, { status: 503 });
  }
}
