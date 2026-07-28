import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { educationGuideItems } from "./education-content";
import { SectionHeading } from "./section-heading";

export async function EducationGuidePage() {
  const t = await getTranslations();

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <Link
        className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        href="/resources"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("educationGuide.backToResources")}
      </Link>
      <div className="mt-8">
        <SectionHeading
          eyebrow={t("educationGuide.eyebrow")}
          title={t("educationGuide.title")}
          description={t("educationGuide.description")}
        />
      </div>
      <p className="mt-6 rounded-xl border border-accent bg-amber-50 px-5 py-4 text-sm leading-6 text-slate-700">
        {t("educationGuide.disclaimer")}
      </p>
      <div className="mt-10 space-y-5">
        {educationGuideItems.map(({ icon: Icon, id, key }) => (
          <article
            id={id}
            className="scroll-mt-24 rounded-xl border border-border bg-white p-6 shadow-sm sm:p-7"
            key={key}
          >
            <Icon aria-hidden="true" className="size-7 text-primary" />
            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              {t(`educationGuide.topics.${key}.title`)}
            </h2>
            <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
              {t(`educationGuide.topics.${key}.description`)}
            </p>
          </article>
        ))}
      </div>
      <div className="mt-10 rounded-xl bg-secondary p-6">
        <h2 className="text-xl font-bold">{t("educationGuide.nextStepTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("educationGuide.nextStepDescription")}
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          href="/signup"
        >
          {t("educationGuide.nextStepAction")}
        </Link>
      </div>
    </section>
  );
}
