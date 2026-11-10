import { HeartHandshake } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { teamCalendlyUrl } from "@/lib/marketing/team-calendly";

/**
 * Home-page spotlight for free Parent Support. "Talk to our team" opens the
 * administrators' Calendly page (TEAM_CALENDLY_URL); to book with a specific
 * provider, families use "Book now" on the team cards in About Us.
 */
export async function ParentSupportSpotlight() {
  const t = await getTranslations("parentSupportSpotlight");
  const calendly = teamCalendlyUrl();
  const buttonClass =
    "inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800";

  return (
    <section
      aria-labelledby="parent-support-heading"
      className="scroll-mt-24 border-y border-emerald-200 bg-emerald-50/70"
      id="parent-support"
    >
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          <HeartHandshake aria-hidden="true" className="size-4" />
          {t("badge")}
        </p>
        <h2
          className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          id="parent-support-heading"
        >
          {t("heading")}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl font-medium">{t("whatItIs")}</p>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-muted-foreground">{t("teamIntro")}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {calendly ? (
            <a className={buttonClass} href={calendly} rel="noopener noreferrer" target="_blank">
              {t("talkToTeam")}
              <span className="sr-only"> {t("opensNewTab")}</span>
            </a>
          ) : (
            <Link className={buttonClass} href="/services/parent-support">
              {t("talkToTeam")}
            </Link>
          )}
          <a className="font-semibold text-emerald-800 underline underline-offset-4" href="#about">
            {t("meetProviders")}
          </a>
        </div>
      </div>
    </section>
  );
}
