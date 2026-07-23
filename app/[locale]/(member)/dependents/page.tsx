import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDependentContext } from "@/lib/dependents/server";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";
export default async function Page() {
  const t = await getTranslations("dependents");
  const context = await getDependentContext();
  if (!context) return <p>{t("accessDenied")}</p>;
  const supabase = await createServerComponentSupabaseClient();
  const { data } = await supabase
    .from("dependents")
    .select("id, first_name, preferred_name, birth_year, grade_level")
    .eq("household_id", context.household.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const dependents = data ?? [];
  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("description")}</p>
        </div>
        {context.canManage && (
          <Link
            className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
            href="/dependents/new"
          >
            {t("add")}
          </Link>
        )}
      </div>
      {dependents.length === 0 ? (
        <div className="mt-8 rounded-xl border p-6">
          <h2 className="font-bold">{t("emptyTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("emptyDescription")}</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {dependents.map((dependent) => (
            <li key={dependent.id}>
              <Link
                className="block rounded-xl border bg-white p-5 hover:bg-secondary"
                href={`/dependents/${dependent.id}`}
              >
                <h2 className="font-bold">{dependent.preferred_name || dependent.first_name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {[dependent.birth_year, dependent.grade_level].filter(Boolean).join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
