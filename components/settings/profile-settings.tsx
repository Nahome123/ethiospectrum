import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/i18n/routing";
import { updateProfileAction } from "@/lib/households/actions";
import { createServerComponentSupabaseClient, getCurrentSupabaseClaims } from "@/lib/supabase/server";

const commonZones = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Africa/Addis_Ababa",
  "Europe/London",
  "UTC",
];

/** The signed-in person's own profile settings; each workspace renders it on its own route. */
export async function ProfileSettings({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "settings" });
  const languages = await getTranslations({ locale, namespace: "services.languages" });
  const claims = await getCurrentSupabaseClaims();
  const supabase = await createServerComponentSupabaseClient();
  const { data: profile } =
    claims && typeof claims.sub === "string"
      ? await supabase
          .from("profiles")
          .select("first_name, last_name, phone, preferred_locale, timezone")
          .eq("id", claims.sub)
          .maybeSingle()
      : { data: null };
  const zones =
    profile?.timezone && !commonZones.includes(profile.timezone)
      ? [profile.timezone, ...commonZones]
      : commonZones;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>
      <div className="rounded-2xl border bg-white p-6">
        <ActionForm
          action={updateProfileAction.bind(null, locale)}
          pendingLabel={t("saving")}
          submitLabel={t("save")}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-first-name">{t("firstName")}</Label>
              <Input
                defaultValue={profile?.first_name ?? ""}
                id="settings-first-name"
                maxLength={80}
                name="firstName"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-last-name">{t("lastName")}</Label>
              <Input
                defaultValue={profile?.last_name ?? ""}
                id="settings-last-name"
                maxLength={80}
                name="lastName"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-phone">{t("phone")}</Label>
            <Input defaultValue={profile?.phone ?? ""} id="settings-phone" name="phone" type="tel" />
            <p className="text-xs text-muted-foreground">{t("phoneHelp")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-locale">{t("language")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                defaultValue={profile?.preferred_locale ?? locale}
                id="settings-locale"
                name="preferredLocale"
              >
                {(["en", "am", "es"] as const).map((value) => (
                  <option key={value} value={value}>
                    {languages(value)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t("languageHelp")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-timezone">{t("timezone")}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                defaultValue={profile?.timezone ?? "America/Chicago"}
                id="settings-timezone"
                name="timezone"
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </ActionForm>
      </div>
    </section>
  );
}
