import { HeartHandshake } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import parentSupportPhoto from "@/public/images/team/team-member-3.jpg";
import { ParentSupportTimes } from "./parent-support-times";

/**
 * Home-page spotlight for the Parent Support consultant (Yoftahe, the third
 * team member in About Us): who he is, that the session is free, and his next
 * open times. Picking a time opens booking with it already selected.
 */
export async function ParentSupportSpotlight() {
  const t = await getTranslations("parentSupportSpotlight");
  const team = await getTranslations("aboutUs.team.third");
  const name = team("name").trim();
  const title = team("title").trim();
  const firstParagraph = team("bio")
    .trim()
    .split(/\n\s*\n/)[0];

  return (
    <section
      aria-labelledby="parent-support-heading"
      className="scroll-mt-24 border-y border-emerald-200 bg-emerald-50/70"
      id="parent-support"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[20rem_1fr] lg:gap-14 lg:px-8">
        <div className="mx-auto w-full max-w-xs overflow-hidden rounded-3xl border-4 border-white shadow-lg lg:max-w-none">
          <Image
            alt={name ? t("photoAlt", { name }) : t("photoAltUnnamed")}
            className="aspect-[4/5] h-auto w-full object-cover object-top"
            placeholder="blur"
            sizes="(min-width: 1024px) 20rem, 18rem"
            src={parentSupportPhoto}
          />
        </div>
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            <HeartHandshake aria-hidden="true" className="size-4" />
            {t("badge")}
          </p>
          <h2
            className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
            id="parent-support-heading"
          >
            {name ? t("title", { name }) : t("titleUnnamed")}
          </h2>
          {title ? <p className="mt-2 font-semibold text-emerald-800">{title}</p> : null}
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{firstParagraph}</p>
          <p className="mt-4 max-w-2xl font-medium">{t("whatItIs")}</p>

          <div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-5">
            <h3 className="font-bold">{t("nextTimes")}</h3>
            <ParentSupportTimes
              labels={{
                loading: t("loading"),
                none: t("noTimes"),
                more: t("moreTimes"),
                timesIn: t("timesIn"),
              }}
            />
          </div>
          <Link
            className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800"
            href="/services/parent-support"
          >
            {t("book")}
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">{t("accountNote")}</p>
        </div>
      </div>
    </section>
  );
}
