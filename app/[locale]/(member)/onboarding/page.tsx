import { HousePlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { getLocaleDashboardPath } from "@/lib/auth/redirects";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { getCurrentHousehold, getCurrentMemberProfile } from "@/lib/supabase/server";
import type { AppLocale } from "@/i18n/routing";

export default async function Page({ params }: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  const t = await getTranslations("onboarding");
  const household = await getCurrentHousehold();
  if (household) redirect(getLocaleDashboardPath(locale as AppLocale));

  const user = await getAuthenticatedUser();
  const profile = user ? await getCurrentMemberProfile(user.id) : null;

  return (
    <section className="max-w-3xl">
      <div className="rounded-xl border border-border bg-white p-8">
        <HousePlus aria-hidden="true" className="size-9 text-primary" />
        <h1 className="mt-5 text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{t("description")}</p>
        <div className="mt-8">
          <OnboardingForm locale={locale as AppLocale} profile={profile} />
        </div>
      </div>
    </section>
  );
}
