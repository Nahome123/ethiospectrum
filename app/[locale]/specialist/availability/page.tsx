import { CalendarClock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/i18n/routing";
import { updateMyAvailabilityAction } from "@/lib/specialists/availability-actions";
import { TimezoneSelect } from "@/components/specialists/timezone-select";
import { WeeklyHoursFields } from "@/components/specialists/weekly-hours-fields";
import { allTimeZones, type WeeklyHour } from "@/lib/specialists/schedule";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Staff choose their own online-booking availability. */
export default async function MyAvailabilityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "specialistConsole.availability" });
  const languageNames = await getTranslations({ locale, namespace: "services.languages" });
  const supabase = await createServerComponentSupabaseClient();
  const [{ data }, bookingPage] = await Promise.all([
    supabase.rpc("get_my_staff_schedule"),
    supabase.rpc("get_my_booking_page"),
  ]);
  const schedule = data?.[0];
  if (!schedule) {
    return (
      <section className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground" role="status">
          {t("unavailable")}
        </p>
      </section>
    );
  }
  const hours = (Array.isArray(schedule.hours) ? schedule.hours : []) as WeeklyHour[];
  // Parent Support staff, and specialists who also offer Parent Support, book it on Calendly.
  const offersParentSupport = schedule.is_parent_support || schedule.parent_support_languages.length > 0;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <CalendarClock aria-hidden="true" className="size-7 text-link" />
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {schedule.is_parent_support ? t("descriptionParentSupport") : t("description")}
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-6">
        <ActionForm
          action={updateMyAvailabilityAction.bind(null, locale)}
          pendingLabel={t("saving")}
          submitLabel={t("save")}
        >
          <label className="flex items-start gap-3 rounded-xl border p-4">
            <input
              className="mt-1 size-4"
              defaultChecked={schedule.accepting_bookings}
              name="accepting"
              type="checkbox"
            />
            <span>
              <span className="block font-semibold">{t("accepting")}</span>
              <span className="block text-sm text-muted-foreground">{t("acceptingHelp")}</span>
            </span>
          </label>

          {offersParentSupport ? (
            <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <input name="choosesBookingPage" type="hidden" value="1" />
              <Label htmlFor="my-calendly">{t("calendly")}</Label>
              <Input
                className="bg-white"
                defaultValue={bookingPage.data ?? ""}
                id="my-calendly"
                name="bookingPageUrl"
                pattern="https://calendly\.com/.*"
                placeholder="https://calendly.com/your-name/parent-support"
                type="url"
              />
              <p className="text-xs text-muted-foreground">{t("calendlyHelp")}</p>
            </div>
          ) : null}

          {schedule.is_parent_support ? (
            <fieldset className="space-y-2">
              <input name="choosesLanguages" type="hidden" value="1" />
              <legend className="text-sm font-semibold">{t("languages")}</legend>
              <p className="text-sm text-muted-foreground">{t("languagesHelp")}</p>
              <div className="flex flex-wrap gap-4">
                {(["en", "am", "es"] as const).map((language) => (
                  <label className="flex items-center gap-2 text-sm" key={language}>
                    <input
                      defaultChecked={schedule.parent_support_languages.includes(language)}
                      name="languages"
                      type="checkbox"
                      value={language}
                    />
                    {languageNames(language)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="my-timezone">{t("timezone")}</Label>
              <TimezoneSelect
                allLabel={t("allZones")}
                commonLabel={t("commonZones")}
                defaultValue={schedule.schedule_timezone}
                id="my-timezone"
                zones={allTimeZones()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-meeting-link">{t("meetingLink")}</Label>
              <Input
                defaultValue={schedule.default_meeting_url ?? ""}
                id="my-meeting-link"
                name="meetingUrl"
                pattern="https://.*"
                placeholder="https://"
                type="url"
              />
              <p className="text-xs text-muted-foreground">{t("meetingLinkHelp")}</p>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t("hours")}</legend>
            <p className="text-sm text-muted-foreground">{t("hoursHelp")}</p>
            <WeeklyHoursFields hours={hours} />
          </fieldset>
        </ActionForm>
      </div>
      <p className="text-sm text-muted-foreground">{t("bookedNote")}</p>
    </section>
  );
}
