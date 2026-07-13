import { BookOpen, CalendarDays, FileText, MessageCircleQuestion, ShieldCheck, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FeatureCard } from "./feature-card";
import { FamilyPhotoGallery } from "./family-photo-gallery";
import { SectionHeading } from "./section-heading";

export async function LandingPage() {
  const t = await getTranslations();
  const cards = [
    [FileText, "documents"],
    [MessageCircleQuestion, "assistant"],
    [CalendarDays, "roadmap"],
    [BookOpen, "resources"],
  ] as const;
  return (
    <>
      <section className="border-b border-border bg-[radial-gradient(circle_at_top_right,_#e5f0ef,_#f7f8f5_55%)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:py-24">
          <div className="self-center">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-secondary-foreground">
              {t("hero.eyebrow")}
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{t("hero.description")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                {t("hero.primaryAction")}
              </Link>
              <Link
                href="/how-it-works"
                className="rounded-md border border-primary px-5 py-3 font-semibold text-primary hover:bg-white"
              >
                {t("hero.secondaryAction")}
              </Link>
            </div>
            <p className="mt-6 text-sm font-medium text-slate-600">{t("hero.trust")}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-md sm:p-7">
            <div className="rounded-xl bg-secondary p-5">
              <p className="text-sm font-bold text-secondary-foreground">{t("common.preview")}</p>
              <h2 className="mt-2 text-2xl font-bold">{t("dashboard.welcome")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("dashboard.intro")}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {["upcoming", "recommended", "recentDocuments", "resource"].map((item) => (
                <div className="rounded-lg border border-border p-4" key={item}>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t(`dashboard.${item}`)}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{t("common.sample")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <FamilyPhotoGallery />
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div className="journey-photo-frame order-2 lg:order-1">
            <img
              src="/images/family/running-girl.jpeg"
              alt={t("hero.journeyAlt")}
              className="journey-photo"
            />
            <span aria-hidden="true" className="journey-sun" />
          </div>
          <div className="order-1 max-w-xl lg:order-2">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-secondary-foreground">
              {t("hero.journeyLabel")}
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {t("hero.journeyTitle")}
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">{t("hero.journeyDescription")}</p>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={t("howItWorks.eyebrow")} title={t("howItWorks.title")} />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {["One", "Two", "Three"].map((step, index) => (
            <article className="rounded-xl border border-border bg-white p-6" key={step}>
              <p className="text-sm font-bold text-primary">0{index + 1}</p>
              <h3 className="mt-4 text-xl font-bold">{t(`howItWorks.step${step}Title`)}</h3>
              <p className="mt-3 leading-7 text-muted-foreground">{t(`howItWorks.step${step}Description`)}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading eyebrow={t("features.eyebrow")} title={t("features.title")} />
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {cards.map(([Icon, key]) => (
              <FeatureCard
                key={key}
                icon={Icon}
                title={t(`features.${key}Title`)}
                description={t(`features.${key}Description`)}
                label={t("common.plannedFeature")}
              />
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <SectionHeading
            eyebrow={t("multilingual.eyebrow")}
            title={t("multilingual.title")}
            description={t("multilingual.description")}
          />
          <div className="mt-7 flex flex-wrap gap-3">
            {["english", "amharic", "spanish"].map((language) => (
              <span
                className="rounded-full border border-border bg-white px-4 py-2 font-semibold"
                key={language}
              >
                {t(`multilingual.${language}`)}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-primary p-7 text-primary-foreground">
          <Sparkles aria-hidden="true" className="size-8 text-accent" />
          <h2 className="mt-6 text-2xl font-bold">{t("digitalBinder.title")}</h2>
          <p className="mt-3 leading-7 text-primary-foreground/85">{t("digitalBinder.description")}</p>
          <ul className="mt-6 space-y-3">
            {["itemOne", "itemTwo", "itemThree"].map((item) => (
              <li className="rounded-md bg-white/10 px-4 py-3" key={item}>
                {t(`digitalBinder.${item}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:px-8">
          <div className="lg:col-span-2">
            <SectionHeading
              eyebrow={t("documentAssistant.eyebrow")}
              title={t("documentAssistant.title")}
              description={t("documentAssistant.description")}
            />
            <p className="mt-5 rounded-md border border-accent bg-amber-50 px-4 py-3 text-sm text-slate-700">
              {t("documentAssistant.notice")}
            </p>
          </div>
          <div className="rounded-xl border border-border p-6">
            <MessageCircleQuestion aria-hidden="true" className="size-7 text-primary" />
            <p className="mt-6 text-sm font-bold text-muted-foreground">{t("documentAssistant.citation")}</p>
            <p className="mt-2 font-semibold">{t("common.plannedFeature")}</p>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          <FeatureCard
            icon={CalendarDays}
            title={t("roadmap.title")}
            description={t("roadmap.description")}
            label={t("common.preview")}
          />
          <FeatureCard
            icon={BookOpen}
            title={t("resources.title")}
            description={t("resources.description")}
            label={t("common.preview")}
          />
          <FeatureCard
            icon={ShieldCheck}
            title={t("privacy.title")}
            description={t("privacy.description")}
            label={t("common.learnMore")}
          />
        </div>
      </section>
      <section className="bg-primary">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center text-primary-foreground sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold">{t("callToAction.title")}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-primary-foreground/85">{t("callToAction.description")}</p>
          <Link
            href="/signup"
            className="mt-7 inline-block rounded-md bg-white px-5 py-3 font-semibold text-primary hover:bg-secondary"
          >
            {t("callToAction.action")}
          </Link>
        </div>
      </section>
    </>
  );
}
