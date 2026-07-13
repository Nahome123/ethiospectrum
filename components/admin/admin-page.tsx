import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function AdminPage({
  page = "overview",
}: {
  page?:
    | "overview"
    | "users"
    | "resources"
    | "translations"
    | "documents"
    | "specialists"
    | "prompts"
    | "auditLogs";
}) {
  const t = await getTranslations("admin");
  return (
    <section className="max-w-3xl">
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
        {t("roleBoundary")}
      </p>
      <div className="mt-4 rounded-xl border border-border bg-white p-8">
        <ShieldCheck aria-hidden="true" className="size-9 text-primary" />
        <h1 className="mt-5 text-3xl font-bold">{t(page)}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{t("description")}</p>
      </div>
    </section>
  );
}
