import { getTranslations } from "next-intl/server";
export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const common = await getTranslations("common");
  return (
    <section>
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
        {common("sample")}
      </p>
      <h1 className="mt-3 text-3xl font-bold">{t("welcome")}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{t("intro")}</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {["upcoming", "recommended", "recentDocuments", "ask", "resource"].map((item) => (
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
