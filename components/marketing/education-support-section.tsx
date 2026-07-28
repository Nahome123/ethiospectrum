import { ArrowRight, MessageCircleQuestion, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { EducationLandingState } from "@/lib/education/landing-state";
import { FeatureCard } from "./feature-card";
import { educationArticleItems, educationFeatureItems } from "./education-content";
import { SectionHeading } from "./section-heading";

const landingActions: Record<EducationLandingState, { href: string; key: string }> = {
  visitor: { href: "/signup", key: "visitor" },
  needs_household: { href: "/onboarding", key: "needsHousehold" },
  ready: { href: "/dashboard", key: "ready" },
};

export async function EducationSupportSection({ state }: { state: EducationLandingState }) {
  const t = await getTranslations();
  const personalizedAction = landingActions[state];

  return (
    <section id="education-support" className="border-y border-border bg-secondary/35 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
          <SectionHeading
            eyebrow={t("educationSupport.eyebrow")}
            title={t("educationSupport.title")}
            description={t("educationSupport.description")}
          />
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-bold text-secondary-foreground">
              {t(`educationSupport.personalization.${personalizedAction.key}.eyebrow`)}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t(`educationSupport.personalization.${personalizedAction.key}.description`)}
            </p>
            <Link
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2"
              href={personalizedAction.href}
            >
              {t(`educationSupport.personalization.${personalizedAction.key}.action`)}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2"
            href="/resources/education"
          >
            {t("educationSupport.primaryAction")}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-primary bg-white px-5 py-3 font-semibold text-primary hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2"
            href="/assistant"
          >
            {t("educationSupport.secondaryAction")}
          </Link>
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {["one", "two", "three", "four"].map((step, index) => (
            <li className="min-w-0 rounded-xl border border-border bg-white p-5 shadow-sm" key={step}>
              <p className="text-sm font-bold text-primary">0{index + 1}</p>
              <h3 className="mt-3 text-lg font-bold text-slate-900">
                {t(`educationSupport.steps.${step}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(`educationSupport.steps.${step}.description`)}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-12">
          <SectionHeading
            eyebrow={t("educationSupport.featuresEyebrow")}
            title={t("educationSupport.featuresTitle")}
            description={t("educationSupport.featuresDescription")}
          />
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {educationFeatureItems.map(({ action, href, icon, key }) => (
              <FeatureCard
                actionHref={href}
                actionLabel={t(`educationSupport.featureActions.${action}`)}
                description={t(`educationSupport.features.${key}.description`)}
                icon={icon}
                key={key}
                title={t(`educationSupport.features.${key}.title`)}
              />
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <div>
            <SectionHeading
              eyebrow={t("educationSupport.articlesEyebrow")}
              title={t("educationSupport.articlesTitle")}
              description={t("educationSupport.articlesDescription")}
            />
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {educationArticleItems.map(({ href, key }) => (
                <article className="min-w-0 rounded-xl border border-border bg-white p-5 shadow-sm" key={key}>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-secondary-foreground">
                    {t(`educationSupport.articles.${key}.category`)}
                  </p>
                  <h3 className="mt-3 text-lg font-bold text-slate-900">
                    {t(`educationSupport.articles.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {t(`educationSupport.articles.${key}.summary`)}
                  </p>
                  <Link
                    className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    href={href}
                  >
                    {t("educationSupport.articleAction")}
                  </Link>
                </article>
              ))}
            </div>
          </div>

          <aside
            className="lg:sticky lg:bottom-4 lg:self-end"
            aria-label={t("educationSupport.assistant.label")}
          >
            <div className="rounded-2xl border border-border bg-primary p-6 text-primary-foreground shadow-md">
              <MessageCircleQuestion aria-hidden="true" className="size-7 text-accent" />
              <h3 className="mt-4 text-xl font-bold">{t("educationSupport.assistant.title")}</h3>
              <p className="mt-2 text-sm leading-6 text-primary-foreground/85">
                {t("educationSupport.assistant.description")}
              </p>
              <Link
                aria-label={t("educationSupport.assistant.action")}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 font-semibold text-primary shadow-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                href="/assistant"
              >
                <Sparkles aria-hidden="true" className="size-4" />
                {t("educationSupport.assistant.action")}
              </Link>
            </div>
          </aside>
        </div>

        <aside className="mt-10 rounded-2xl border border-border bg-white p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <p className="text-sm font-bold text-secondary-foreground">
              {t("educationSupport.membership.eyebrow")}
            </p>
            <h3 className="mt-2 text-xl font-bold text-slate-900">
              {t("educationSupport.membership.title")}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("educationSupport.membership.description")}
            </p>
          </div>
          <Link
            className="mt-5 inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-primary px-4 py-2.5 font-semibold text-primary hover:bg-secondary sm:mt-0"
            href="/pricing"
          >
            {t("educationSupport.membership.action")}
          </Link>
        </aside>
      </div>
    </section>
  );
}
