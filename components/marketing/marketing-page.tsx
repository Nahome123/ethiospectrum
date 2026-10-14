import { getLocale, getTranslations } from "next-intl/server";
import { privacyPolicy, termsOfUse } from "@/lib/legal/documents";
import { LegalDocumentView } from "./legal-document";
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
  const document = privacy ? privacyPolicy : termsOfUse;
  const locale = await getLocale();
  return (
    <LegalDocumentView
      contentsLabel={t("legal.contents")}
      document={document}
      draftNotice={t("legal.draftNotice")}
      englishOnlyNotice={locale === "en" ? undefined : t("legal.englishOnly")}
      lastUpdatedLabel={t("legal.lastUpdated", { date: document.lastUpdated })}
      title={privacy ? t("legal.privacyTitle") : t("legal.termsTitle")}
    />
  );
}
