import { NextResponse } from "next/server";
import { getDocumentContext } from "@/lib/documents/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { documentIdSchema } from "@/lib/validation/document";

function notFoundResponse() {
  return new NextResponse(null, { status: 404 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!documentIdSchema.safeParse(documentId).success) return notFoundResponse();
  const context = await getDocumentContext();
  if (!context) return notFoundResponse();

  const supabase = await createRouteHandlerSupabaseClient();
  const { data: document } = await supabase
    .from("documents")
    .select("storage_bucket, storage_path, original_filename")
    .eq("id", documentId)
    .eq("household_id", context.household.id)
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
