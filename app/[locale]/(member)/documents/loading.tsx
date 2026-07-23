import { getTranslations } from "next-intl/server";

export default async function DocumentsLoading() {
  const t = await getTranslations("documents");
  return (
    <section aria-live="polite" aria-busy="true" role="status">
      <h1 className="text-3xl font-bold">{t("binderTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("loadingDocuments")}</p>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div
            className="h-56 animate-pulse rounded-2xl border bg-muted/60 motion-reduce:animate-none"
            key={index}
          />
        ))}
      </div>
    </section>
  );
}
