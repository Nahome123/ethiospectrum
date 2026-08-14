import { getTranslations } from "next-intl/server";
import { IepAccommodationsGuide } from "@/components/resources/iep-accommodations-guide";
import type { AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";

export default async function IepAccommodationsPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  await requireUser(locale, `/${locale}/member/resources/iep-504-accommodations`);
  const [t, accessibility] = await Promise.all([
    getTranslations({ locale, namespace: "iepAccommodations" }),
    getTranslations({ locale, namespace: "accessibility" }),
  ]);

  return (
    <section className="mx-auto max-w-6xl">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:font-semibold"
        href="#iep-accommodations-content"
      >
        {accessibility("skipToContent")}
      </a>
      <Link
        className="mb-5 inline-flex text-sm font-semibold text-primary hover:underline"
        href="/member/resources"
      >
        {t("backToResources")}
      </Link>
      <IepAccommodationsGuide
        labels={{
          amharic: t("amharic"),
          backToTop: t("backToTop"),
          contents: t("contents"),
          contentsDescription: t("contentsDescription"),
          contentsStatus: t("contentsStatus"),
          english: t("english"),
          eyebrow: t("eyebrow"),
          readingProgress: t("readingProgress"),
          sectionStatus: (section, total) => t("sectionStatus", { section, total }),
          sectionSummary: (section, count) => t("sectionSummary", { section, count }),
        }}
      />
      <aside className="mt-8 rounded-2xl border border-border bg-secondary/40 p-5">
        <p className="font-semibold">{t("educationalUseOnly")}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("educationalNotice")}</p>
      </aside>
    </section>
  );
}
