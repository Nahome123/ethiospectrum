import "server-only";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const DOCUMENTS_BUCKET = "family-documents";

export type OwnedHouseholdPreview = {
  id: string;
  name: string;
  dependents: number;
  requests: number;
  payments: number;
  openRefunds: number;
  documents: number;
  files: number;
  caregivers: number;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
};

export type MemberDeletionPreview = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  ownedHousehold: OwnedHouseholdPreview | null;
  /** Households this person belongs to as a caregiver (they stay). */
  memberOf: string[];
};

/** A deletion step that failed; earlier steps are complete and safe to repeat. */
export class MemberDeletionError extends Error {
  constructor(readonly step: "audit" | "stripe" | "storage" | "account" | "verify") {
    super(`member_deletion_failed_at_${step}`);
    this.name = "MemberDeletionError";
  }
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: value, error } = await query;
  if (error) throw new Error("deletion_preview_failed");
  return value ?? 0;
}

/** Every stored object under households/<id>/, walking sub-folders. */
export async function listHouseholdFiles(admin: AdminClient, householdId: string): Promise<string[]> {
  const files: string[] = [];
  const folders = [`households/${householdId}`];
  while (folders.length > 0) {
    const folder = folders.pop() as string;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .list(folder, { limit: 1000, offset });
      if (error) throw new Error("storage_list_failed");
      for (const entry of data ?? []) {
        // Folders are returned without an id.
        if (entry.id === null) folders.push(`${folder}/${entry.name}`);
        else files.push(`${folder}/${entry.name}`);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return files;
}

export async function getMemberDeletionPreview(
  admin: AdminClient,
  userId: string,
): Promise<MemberDeletionPreview | null> {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user) return null;
  const [{ data: profile }, { data: roleRow }, { data: household }, { data: memberships }] =
    await Promise.all([
      admin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      admin
        .from("households")
        .select("id, name")
        .eq("primary_owner_id", userId)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("household_members")
        .select("permission, households!inner(name, primary_owner_id)")
        .eq("user_id", userId)
        .eq("status", "active"),
    ]);
  const email = (userData.user.email ?? "").toLowerCase();
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || email;

  let ownedHousehold: OwnedHouseholdPreview | null = null;
  if (household) {
    const id = household.id;
    const [dependents, requests, payments, openRefunds, documents, caregivers, files, billing, subscription] =
      await Promise.all([
        count(admin.from("dependents").select("id", { count: "exact", head: true }).eq("household_id", id)),
        count(
          admin.from("service_requests").select("id", { count: "exact", head: true }).eq("household_id", id),
        ),
        count(
          admin.from("service_payments").select("id", { count: "exact", head: true }).eq("household_id", id),
        ),
        count(
          admin
            .from("service_refunds")
            .select("id", { count: "exact", head: true })
            .eq("household_id", id)
            .in("status", ["requested", "processing"]),
        ),
        count(admin.from("documents").select("id", { count: "exact", head: true }).eq("household_id", id)),
        count(
          admin
            .from("household_members")
            .select("id", { count: "exact", head: true })
            .eq("household_id", id)
            .eq("status", "active")
            .neq("user_id", userId),
        ),
        listHouseholdFiles(admin, id),
        admin.from("billing_customers").select("stripe_customer_id").eq("household_id", id).maybeSingle(),
        admin.from("billing_subscriptions").select("stripe_status").eq("household_id", id).maybeSingle(),
      ]);
    ownedHousehold = {
      id,
      name: household.name,
      dependents,
      requests,
      payments,
      openRefunds,
      documents,
      files: files.length,
      caregivers,
      stripeCustomerId: billing.data?.stripe_customer_id ?? null,
      subscriptionStatus: subscription.data?.stripe_status ?? null,
    };
  }

  return {
    userId,
    email,
    displayName,
    role: roleRow?.role ?? "member",
    ownedHousehold,
    memberOf: (memberships ?? [])
      .filter((row) => row.households.primary_owner_id !== userId)
      .map((row) => row.households.name),
  };
}

/**
 * Deletes a member in an order that never leaves billing running on a deleted
 * account: audit entry, Stripe (cancel subscriptions, delete the customer),
 * stored files, then the account itself, whose deletion cascades through the
 * database. Each step can be repeated after a failure.
 */
export async function deleteMember({
  actorId,
  admin,
  preview,
  reason,
  stripe,
}: {
  actorId: string;
  admin: AdminClient;
  preview: MemberDeletionPreview;
  reason: string | null;
  stripe: Stripe | null;
}): Promise<void> {
  const household = preview.ownedHousehold;

  const audit = await admin.from("audit_logs").insert({
    actor_id: actorId,
    action: "user_deleted",
    entity_type: "user",
    entity_id: preview.userId,
    metadata: {
      role: preview.role,
      owned_household: Boolean(household),
      dependents: household?.dependents ?? 0,
      requests: household?.requests ?? 0,
      payments: household?.payments ?? 0,
      files: household?.files ?? 0,
      ...(reason ? { reason } : {}),
    },
  });
  if (audit.error) throw new MemberDeletionError("audit");

  if (household?.stripeCustomerId) {
    if (!stripe) throw new MemberDeletionError("stripe");
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: household.stripeCustomerId,
        status: "all",
        limit: 100,
      });
      for (const subscription of subscriptions.data) {
        if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
          await stripe.subscriptions.cancel(subscription.id, { prorate: false, invoice_now: false });
        }
      }
      // Removes saved cards and contact details; Stripe keeps legally required payment history.
      await stripe.customers.del(household.stripeCustomerId);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code !== "resource_missing") throw new MemberDeletionError("stripe");
    }
  }

  if (household) {
    try {
      const files = await listHouseholdFiles(admin, household.id);
      for (let index = 0; index < files.length; index += 100) {
        const { error } = await admin.storage.from(DOCUMENTS_BUCKET).remove(files.slice(index, index + 100));
        if (error) throw error;
      }
    } catch {
      throw new MemberDeletionError("storage");
    }
  }

  const deleted = await admin.auth.admin.deleteUser(preview.userId);
  if (deleted.error && deleted.error.status !== 404) throw new MemberDeletionError("account");

  const [{ data: remainingUser }, remainingHousehold] = await Promise.all([
    admin.auth.admin.getUserById(preview.userId),
    household
      ? admin.from("households").select("id", { count: "exact", head: true }).eq("id", household.id)
      : Promise.resolve({ count: 0 }),
  ]);
  if (remainingUser?.user || (remainingHousehold.count ?? 0) > 0) throw new MemberDeletionError("verify");
}
