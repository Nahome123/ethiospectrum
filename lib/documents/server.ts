import "server-only";

import type { Database } from "@/lib/supabase/types";
import {
  createServerComponentSupabaseClient,
  getCurrentHousehold,
  getCurrentSupabaseClaims,
} from "@/lib/supabase/server";

type HouseholdPermission = Database["public"]["Enums"]["household_permission"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

const uploadPermissions = new Set<HouseholdPermission>(["owner", "administrator", "member"]);
const archiveManagerPermissions = new Set<HouseholdPermission>(["owner", "administrator"]);

export type DocumentContext = {
  household: { id: string; name: string };
  userId: string;
  permission: HouseholdPermission;
  canUpload: boolean;
};

export async function getDocumentContext(): Promise<DocumentContext | null> {
  const claims = await getCurrentSupabaseClaims();
  const household = await getCurrentHousehold();
  if (!claims || typeof claims.sub !== "string" || !household) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("household_members")
    .select("permission")
    .eq("household_id", household.id)
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;

  return {
    household,
    userId: claims.sub,
    permission: data.permission,
    canUpload: uploadPermissions.has(data.permission),
  };
}

export function canArchiveDocument(context: DocumentContext, document: Pick<DocumentRow, "uploaded_by">) {
  return (
    archiveManagerPermissions.has(context.permission) ||
    (context.canUpload && document.uploaded_by === context.userId)
  );
}

export async function getUploadDependents() {
  const context = await getDocumentContext();
  if (!context) return { context: null, dependents: [] };

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("dependents")
    .select("id, first_name, preferred_name")
    .eq("household_id", context.household.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return { context, dependents: data ?? [] };
}

export async function getHouseholdDocuments() {
  const context = await getDocumentContext();
  if (!context) return { context: null, documents: [] as DocumentRow[] };

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("household_id", context.household.id)
    .order("created_at", { ascending: false });
  return { context, documents: data ?? [] };
}

export async function getVisibleDocument(documentId: string) {
  const context = await getDocumentContext();
  if (!context) return null;

  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("household_id", context.household.id)
    .maybeSingle();
  return data ? { context, document: data } : null;
}

export async function getDocumentDependentName(dependentId: string | null) {
  if (!dependentId) return null;
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("dependents")
    .select("first_name, preferred_name")
    .eq("id", dependentId)
    .is("archived_at", null)
    .maybeSingle();
  return data ? data.preferred_name || data.first_name : null;
}
