import { BookOpen, Check, Languages, MessagesSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getHouseholdAccess } from "@/lib/households/server";
import { formatCents } from "@/lib/services/constants";
import { localizedText } from "@/lib/services/display";
import { listServices } from "@/lib/services/server";
import { getTrainingAccess } from "@/lib/training/server";

const icons = {
  rbt_bootcamp: BookOpen,
  consultation: MessagesSquare,
  iep_language_assistance: Languages,
} as const;

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "services.catalog" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const [services, access, training] = await Promise.all([
    listServices(),
    getHouseholdAccess(),
    getTrainingAccess(),
  ]);
  const canRequest = Boolean(access?.permissions.includes("submit_requests"));

  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">{t("intro")}</p>
      </div>
      <p
        className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-semibold leading-6"
        role="note"
      >
        {t("independentNotice")}
      </p>
      {!access ? (
        <p className="rounded-xl border bg-secondary/40 p-4 text-sm" role="status">
          {t("householdRequired")}
        </p>
      ) : null}
      <ul className="grid gap-5 lg:grid-cols-3">
        {services
          .filter((service) => service.active)
          .map((service) => {
            const type = service.service_type as keyof typeof icons;
            const Icon = icons[type];
            const isSubscription = type === "rbt_bootcamp";
            const features = t.raw(`features.${type}`) as string[];
            return (
              <li className="flex flex-col rounded-2xl border bg-white p-6 shadow-sm" key={service.id}>
                <Icon aria-hidden="true" className="size-9 text-primary" />
                <h2 className="mt-4 text-xl font-bold">{types(type)}</h2>
                <p className="mt-2 text-2xl font-bold">
                  {isSubscription
                    ? service.price_cents !== null
                      ? t("monthlyPrice", { price: formatCents(service.price_cents, locale) })
                      : t("monthlySubscription")
                    : formatCents(service.price_cents, locale)}
                </p>
                <p className="text-sm font-semibold text-muted-foreground">
                  {isSubscription
                    ? t("recurring")
                    : t("oneTime", { minutes: service.duration_minutes ?? 60 })}
                </p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {localizedText(
                    service.localized,
                    locale,
                    "description",
                    service.description,
                    t(`descriptions.${type}`),
                  )}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {features.map((feature) => (
                    <li className="flex gap-2" key={feature}>
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  {isSubscription ? (
                    <Link
                      className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                      href={training.hasAccess ? "/training" : "/billing"}
                    >
                      {training.hasAccess ? t("openTraining") : t("subscribe")}
                    </Link>
                  ) : canRequest ? (
                    <Link
                      className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                      href={type === "consultation" ? "/services/consultation" : "/services/iep"}
                    >
                      {t(`request.${type}`)}
                    </Link>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noRequestPermission")}</p>
                  )}
                </div>
              </li>
            );
          })}
      </ul>
      <p className="text-sm text-muted-foreground">{t("taxNotice")}</p>
    </section>
  );
}
