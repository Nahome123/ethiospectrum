import { NextResponse } from "next/server";
import { getDocumentContext } from "@/lib/documents/server";
import { documentCitationNavigationSearchSchema } from "@/lib/documents/citations/schemas";
import { resolveDocumentCitationEvidence } from "@/lib/documents/citations/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import { documentIdSchema } from "@/lib/validation/document";

function notFoundResponse() {
  return new NextResponse(null, { status: 404 });
}

/**
 * Redirects only a validated PDF citation to a fresh private signed URL. The
 * requested page is derived from the stored citation, never from this URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!documentIdSchema.safeParse(documentId).success) return notFoundResponse();

  const url = new URL(request.url);
  const navigation = documentCitationNavigationSearchSchema.safeParse({
    citationOwner: url.searchParams.get("citationOwner"),
    ownerId: url.searchParams.get("ownerId"),
    citation: url.searchParams.get("citation"),
  });
  if (!navigation.success) return notFoundResponse();

  const context = await getDocumentContext();
  if (!context) return notFoundResponse();

  const supabase = await createRouteHandlerSupabaseClient();
  const evidence = await resolveDocumentCitationEvidence(supabase, {
    documentId,
    ownerType: navigation.data.citationOwner,
    ownerId: navigation.data.ownerId,
    citationIndex: navigation.data.citation,
  });
  if (
    evidence.availability !== "available" ||
    evidence.sourceKind !== "page" ||
    !evidence.pageNumber ||
    !evidence.canOpenOriginal
  ) {
    return notFoundResponse();
  }

  const { data: document } = await supabase
    .from("documents")
    .select("storage_bucket, storage_path, mime_type")
    .eq("id", documentId)
    .eq("household_id", context.household.id)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "completed")
    .eq("mime_type", "application/pdf")
    .is("deleted_at", null)
    .maybeSingle();
  if (!document) return notFoundResponse();

  const signed = await supabase.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60);
  if (signed.error || !signed.data) return new NextResponse(null, { status: 503 });
  return NextResponse.redirect(`${signed.data.signedUrl}#page=${String(evidence.pageNumber)}`);
}
