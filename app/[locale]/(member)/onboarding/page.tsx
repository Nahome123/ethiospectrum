import { HousePlus, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { getCurrentHousehold } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export default async function Page({ params }: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  const t = await getTranslations("onboarding");
  const household = await getCurrentHousehold();

  if (household) {
    return (
      <section className="max-w-3xl">
        <div className="rounded-xl border border-border bg-white p-8">
          <UsersRound aria-hidden="true" className="size-9 text-primary" />
          <h1 className="mt-5 text-3xl font-bold">{t("completeTitle")}</h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            {t("completeDescription", { householdName: household.name })}
          </p>
          <Link
            className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            href="/dashboard"
            locale={locale as AppLocale}
          >
            {t("goToDashboard")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-3xl">
      <div className="rounded-xl border border-border bg-white p-8">
        <HousePlus aria-hidden="true" className="size-9 text-primary" />
        <h1 className="mt-5 text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{t("description")}</p>
        <div className="mt-8">
          <OnboardingForm locale={locale as AppLocale} />
        </div>
      </div>
    </section>
  );
}
