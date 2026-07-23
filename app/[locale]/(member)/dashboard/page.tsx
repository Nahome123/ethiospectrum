import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDependentContext } from "@/lib/dependents/server";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const common = await getTranslations("common");
  const dependentsT = await getTranslations("dependents");
  const context = await getDependentContext();
  const supabase = await createServerComponentSupabaseClient();
  const dependentResult = context
    ? await supabase
        .from("dependents")
        .select("id, first_name, preferred_name")
        .eq("household_id", context.household.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(3)
    : { data: [] as { id: string; first_name: string; preferred_name: string | null }[] };
  const dependentCountResult = context
    ? await supabase
        .from("dependents")
        .select("id", { count: "exact", head: true })
        .eq("household_id", context.household.id)
        .is("archived_at", null)
    : { count: 0 };
  const documentResult = context
    ? await supabase
        .from("documents")
        .select("id, title")
        .eq("household_id", context.household.id)
        .eq("upload_status", "uploaded")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3)
    : { data: [] as { id: string; title: string }[] };
  const documentCountResult = context
    ? await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("household_id", context.household.id)
        .eq("upload_status", "uploaded")
        .is("deleted_at", null)
    : { count: 0 };
  const incompleteDocumentCountResult = context
    ? await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("household_id", context.household.id)
        .in("upload_status", ["pending", "failed"])
        .is("deleted_at", null)
    : { count: 0 };
  const dependents = dependentResult.data ?? [];
  const dependentCount = dependentCountResult.count ?? 0;
  const documents = documentResult.data ?? [];
  const documentCount = documentCountResult.count ?? 0;
  const incompleteDocumentCount = incompleteDocumentCountResult.count ?? 0;
  return (
    <section>
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
        {common("sample")}
      </p>
      <h1 className="mt-3 text-3xl font-bold">{t("welcome")}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t("intro")}</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-border bg-white p-5">
          <h2 className="font-bold">{dependentsT("dashboardTitle")}</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {dependentsT("dashboardCount", { count: dependentCount })}
          </p>
          {dependents.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {dependents.map((dependent) => (
                <li key={dependent.id}>{dependent.preferred_name || dependent.first_name}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{dependentsT("emptyDescription")}</p>
          )}
          <Link className="mt-4 inline-block font-semibold text-primary underline" href="/dependents">
            {dependentsT("manage")}
          </Link>
        </article>
        <article className="rounded-xl border border-border bg-white p-5">
          <h2 className="font-bold">{t("recentDocuments")}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{t("documentCount", { count: documentCount })}</p>
          {incompleteDocumentCount ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pendingDocumentCount", { count: incompleteDocumentCount })}
            </p>
          ) : null}
          {documents.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {documents.map((document) => (
                <li key={document.id}>
                  <Link className="underline hover:text-primary" href={`/documents/${document.id}`}>
                    {document.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t("documentsEmpty")}</p>
          )}
          <Link className="mt-4 inline-block font-semibold text-primary underline" href="/documents">
            {t("manageDocuments")}
          </Link>
        </article>
        {["upcoming", "recommended", "ask", "resource"].map((item) => (
          <article className="rounded-xl border border-border bg-white p-5" key={item}>
            <h2 className="font-bold">{t(item)}</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {item === "upcoming"
                ? t("sampleDeadline")
                : item === "recommended"
                  ? t("sampleAction")
                  : item === "resource"
                    ? t("sampleResource")
                    : common("sample")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
