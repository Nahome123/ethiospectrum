import { notFound } from "next/navigation";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic for household-resolution issues. Disabled (404) unless
 * ETHIOSPECTRUM_DEBUG_WHOAMI=true. It shows only the signed-in caller's own
 * identity and what the database returns for them. Remove after diagnosis.
 */
export default async function DebugWhoAmIPage() {
  if (process.env.ETHIOSPECTRUM_DEBUG_WHOAMI !== "true") notFound();

  const supabase = await createServerComponentSupabaseClient();
  const [{ data: userData, error: userError }, { data: claimsData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getClaims(),
  ]);
  const [access, membership] = await Promise.all([
    supabase.rpc("get_current_household_access"),
    supabase
      .from("household_members")
      .select("household_id, permission, status")
      .eq("user_id", userData.user?.id ?? "00000000-0000-0000-0000-000000000000"),
  ]);

  const report = {
    user_id: userData.user?.id ?? null,
    user_email: userData.user?.email ?? null,
    user_error: userError?.message ?? null,
    jwt_sub: claimsData?.claims?.sub ?? null,
    jwt_role: claimsData?.claims?.role ?? null,
    rpc_get_current_household_access: { data: access.data, error: access.error },
    rls_household_members: { data: membership.data, error: membership.error },
    // PGRST202 / 42883 on the RPC means the 20260929* migrations are not applied.
  };

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Debug: who am I</h1>
      <pre className="mt-4 overflow-x-auto rounded-xl border bg-white p-4 text-xs">
        {JSON.stringify(report, null, 2)}
      </pre>
    </section>
  );
}
