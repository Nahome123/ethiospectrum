import { NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { uuidSchema } from "@/lib/validation/services";

function notFoundResponse() {
  return new NextResponse(null, { status: 404 });
}

/**
 * Download for a document linked to a service request. Row- and object-level
 * policies admit the household, the request's assigned specialist, and
 * administrators only; every other caller gets the same 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string; documentId: string }> },
) {
  const { requestId, documentId } = await params;
  if (!uuidSchema.safeParse(requestId).success || !uuidSchema.safeParse(documentId).success) {
    return notFoundResponse();
  }
  const supabase = await createRouteHandlerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return notFoundResponse();

  const { data: document } = await supabase
    .from("documents")
    .select("storage_bucket, storage_path, original_filename")
    .eq("id", documentId)
    .eq("service_request_id", requestId)
    .eq("upload_status", "uploaded")
    .is("deleted_at", null)
    .maybeSingle();
  if (!document) return notFoundResponse();

  const signed = await supabase.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60, { download: document.original_filename });
  if (signed.error || !signed.data) return new NextResponse(null, { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl);
}
