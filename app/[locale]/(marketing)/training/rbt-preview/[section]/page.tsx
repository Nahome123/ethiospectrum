import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  RbtTrainingFooter,
  RbtTrainingHero,
  RbtTrainingLesson,
} from "@/components/training/rbt-training-lesson";
import { RbtTrainingNavigation } from "@/components/training/rbt-training-navigation";
import { rbtRouteBySection, rbtSectionByRoute } from "@/features/training/rbt/constants";
import { rbtSectionIds } from "@/features/training/rbt/types";
import type { AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";

export default async function RbtTrainingPreviewSectionPage({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}) {
  const { locale: localeParam, section: routeSection } = await params;
  const locale = localeParam as AppLocale;
  const section = rbtSectionByRoute[routeSection];
  if (!section) redirect(`/${locale}/training/rbt-preview/overview`);

  const [t, accessibility] = await Promise.all([
    getTranslations("training"),
    getTranslations("accessibility"),
  ]);
  const sectionIndex = rbtSectionIds.indexOf(section);
  const previousSection = rbtSectionIds[sectionIndex - 1];
  const nextSection = rbtSectionIds[sectionIndex + 1];

  return (
    <section>
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:font-semibold"
        href="#rbt-preview-content"
      >
        {accessibility("skipToContent")}
      </a>
      <RbtTrainingHero />
      <RbtTrainingNavigation
        basePath="/training/rbt-preview"
        currentSection={section}
        label={t("sectionNavigation")}
      />
      <p className="mb-6 font-heading text-2xl font-bold">{t("rbtTitle")}</p>
      <main id="rbt-preview-content">
        <RbtTrainingLesson
          labels={{
            collapseAll: t("collapseAll"),
            expandAll: t("expandAll"),
            hideAnswer: t("hideAnswer"),
            noMatches: t("noGlossaryMatches"),
            revealAnswer: t("revealAnswer"),
            searchGlossary: t("searchGlossary"),
          }}
          section={section}
        />
        <aside className="mt-8 rounded-3xl border border-[#c8982a]/45 bg-[#fdf6e7] p-5">
          <p className="font-semibold text-[#765717]">{t("educationalUseOnly")}</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{t("educationalNotice")}</p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">{t("notOfficialCertification")}</p>
        </aside>
        <nav aria-label={t("sequenceNavigation")} className="mt-8 flex flex-wrap justify-between gap-3">
          {previousSection ? (
            <Link
              className="rounded-full border border-border px-4 py-2 font-semibold hover:bg-muted"
              href={`/training/rbt-preview/${rbtRouteBySection[previousSection]}`}
            >
              {t("previousSection")}
            </Link>
          ) : (
            <span />
          )}
          {nextSection ? (
            <Link
              className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/80"
              href={`/training/rbt-preview/${rbtRouteBySection[nextSection]}`}
            >
              {t("nextSection")}
            </Link>
          ) : null}
        </nav>
      </main>
      <RbtTrainingFooter />
    </section>
  );
}
