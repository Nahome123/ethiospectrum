import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { ServicesOverview } from "./services-overview";

export async function MarketingPage({
  type,
}: {
  type: "features" | "howItWorks" | "resources" | "pricing" | "privacy" | "terms";
}) {
  const t = await getTranslations();
  if (type === "features")
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={t("features.eyebrow")}
          title={t("features.title")}
          description={t("marketingPages.featuresIntro")}
        />
        <div className="mt-10">
          <ServicesOverview />
        </div>
      </div>
    );
  if (type === "howItWorks")
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={t("howItWorks.eyebrow")}
          title={t("howItWorks.title")}
          description={t("marketingPages.howItWorksIntro")}
        />
        <ol className="mt-10 space-y-5">
          {["One", "Two", "Three"].map((step, index) => (
            <li className="rounded-xl border border-border bg-white p-6" key={step}>
              <p className="text-sm font-bold text-link">0{index + 1}</p>
              <h3 className="mt-2 text-xl font-bold">{t(`howItWorks.step${step}Title`)}</h3>
              <p className="mt-2 leading-7 text-muted-foreground">{t(`howItWorks.step${step}Description`)}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  if (type === "resources")
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={t("resources.eyebrow")}
          title={t("resources.title")}
          description={t("resources.pageIntro")}
        />
        <div className="mt-10 grid gap-4">
          {["resourceOne", "resourceTwo", "resourceThree"].map((item) => (
            <article className="rounded-xl border border-border bg-white p-5" key={item}>
              <h3 className="font-bold">{t(`resources.${item}`)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("common.preview")}</p>
            </article>
          ))}
        </div>
      </div>
    );
  if (type === "pricing")
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={t("pricing.eyebrow")}
          title={t("pricing.title")}
          description={t("pricing.description")}
        />
        <div className="mt-10">
          <ServicesOverview showPolicy />
        </div>
      </div>
    );
  const privacy = type === "privacy";
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow={privacy ? t("privacy.eyebrow") : t("marketingPages.termsTitle")}
        title={privacy ? t("privacy.title") : t("marketingPages.termsTitle")}
        description={privacy ? t("privacy.pageIntro") : t("marketingPages.termsIntro")}
      />
      <div className="mt-10 rounded-xl border border-border bg-secondary p-5 text-sm font-medium text-slate-700">
        {t("legal.draftNotice")}
      </div>
      <article className="mt-5 rounded-xl border border-border bg-white p-7">
        <ShieldCheck aria-hidden="true" className="size-7 text-link" />
        <p className="mt-5 leading-8 text-muted-foreground">
          {t(privacy ? "legal.privacyBody" : "legal.termsBody")}
        </p>
      </article>
    </div>
  );
}
