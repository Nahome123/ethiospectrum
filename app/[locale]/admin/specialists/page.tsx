import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { StatusPill } from "@/components/services/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { updateSpecialistAction, updateSpecialistScheduleAction } from "@/lib/services/config-actions";
import { deliveryMethodValues } from "@/lib/services/constants";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type Capability = { service_type: string; language: string; delivery_method: string };

/** Every capability an administrator can grant, grouped by service. */
const capabilityGrid = [
  { service: "consultation", languages: ["en", "am", "es"], methods: deliveryMethodValues },
  { service: "iep_language_assistance", languages: ["am", "es"], methods: deliveryMethodValues },
  // Parent Support is a free remote session; only specialists ticked here offer it.
  { service: "parent_support", languages: ["en", "am", "es"], methods: ["remote"] },
] as const;

type Schedule = { schedule_timezone: string; default_meeting_url: string | null; hours: unknown };
const weekdays = [1, 2, 3, 4, 5, 6, 0] as const;
const commonZones = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "Africa/Addis_Ababa",
  "Europe/London",
  "UTC",
];

export default async function AdminSpecialistsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminConsole.specialistsPage" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const languages = await getTranslations({ locale, namespace: "services.languages" });
  const iepLanguages = await getTranslations({ locale, namespace: "services.iepLanguages" });
  const delivery = await getTranslations({ locale, namespace: "services.deliveryMethods" });
  const supabase = await createServerComponentSupabaseClient();
  const [{ data, error }, schedulesResult] = await Promise.all([
    supabase.rpc("admin_list_specialists"),
    supabase.rpc("admin_list_specialist_schedules"),
  ]);
  const specialists = data ?? [];
  const schedules = new Map<string, Schedule>(
    (schedulesResult.data ?? []).map((row) => [row.specialist_id, row]),
  );
  const dayName = (weekday: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + weekday)),
    );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
        <p className="mt-2 text-sm">
          {t("promoteHint")}{" "}
          <Link className="font-semibold underline" href="/admin/users?role=member">
            {t("usersLink")}
          </Link>
        </p>
      </div>
      <datalist id="schedule-zones">
        {commonZones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      {error ? (
        <p role="alert">{t("loadError")}</p>
      ) : specialists.length === 0 ? (
        <p className="rounded-2xl border bg-white p-6 text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {specialists.map((specialist) => {
            const capabilities = (
              Array.isArray(specialist.capabilities) ? specialist.capabilities : []
            ) as Capability[];
            const has = (service: string, language: string, method: string) =>
              capabilities.some(
                (item) =>
                  item.service_type === service &&
                  item.language === language &&
                  item.delivery_method === method,
              );
            return (
              <li className="rounded-2xl border bg-white p-5" key={specialist.specialist_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{specialist.display_name}</h2>
                    <p className="text-sm text-muted-foreground">{specialist.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      label={
                        specialist.availability_status === "available" ? t("available") : t("unavailable")
                      }
                      tone={specialist.availability_status === "available" ? "success" : "neutral"}
                    />
                    <StatusPill
                      label={t("activeRequests", { count: Number(specialist.active_request_count) })}
                      tone="info"
                    />
                  </div>
                </div>
                <ActionForm
                  action={updateSpecialistAction.bind(null, locale, specialist.specialist_id)}
                  className="mt-4"
                  pendingLabel={t("saving")}
                  submitLabel={t("save")}
                >
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold">{t("capabilities")}</legend>
                    {capabilityGrid.map((group) => (
                      <div key={group.service}>
                        <p className="text-sm font-medium">{types(group.service)}</p>
                        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                          {group.languages.map((language) =>
                            group.methods.map((method) => (
                              <label
                                className="flex items-center gap-2 text-sm"
                                key={`${group.service}-${language}-${method}`}
                              >
                                <input
                                  defaultChecked={has(group.service, language, method)}
                                  name="capabilities"
                                  type="checkbox"
                                  value={`${group.service}:${language}:${method}`}
                                />
                                {group.service === "iep_language_assistance"
                                  ? iepLanguages(language)
                                  : languages(language)}{" "}
                                · {delivery(method)}
                              </label>
                            )),
                          )}
                        </div>
                      </div>
                    ))}
                  </fieldset>
                  <fieldset className="flex flex-wrap gap-4 text-sm">
                    <legend className="mb-1 text-sm font-semibold">{t("availability")}</legend>
                    {(["available", "unavailable"] as const).map((value) => (
                      <label className="flex items-center gap-2" key={value}>
                        <input
                          defaultChecked={specialist.availability_status === value}
                          name="availability"
                          type="radio"
                          value={value}
                        />
                        {t(value)}
                      </label>
                    ))}
                  </fieldset>
                  <div className="space-y-1.5">
                    <Label htmlFor={`bio-${specialist.specialist_id}`}>{t("bio")}</Label>
                    <Textarea
                      defaultValue={specialist.bio ?? ""}
                      id={`bio-${specialist.specialist_id}`}
                      maxLength={2000}
                      name="bio"
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">{t("bioHelp")}</p>
                  </div>
                </ActionForm>
                {(() => {
                  const schedule = schedules.get(specialist.specialist_id);
                  const hours = (Array.isArray(schedule?.hours) ? schedule.hours : []) as {
                    weekday: number;
                    start: string;
                    end: string;
                  }[];
                  const id = specialist.specialist_id;
                  return (
                    <details className="mt-4 rounded-xl border p-4">
                      <summary className="cursor-pointer text-sm font-semibold">
                        {t("scheduleTitle")}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {hours.length ? t("scheduleDays", { count: hours.length }) : t("scheduleEmpty")}
                        </span>
                      </summary>
                      <ActionForm
                        action={updateSpecialistScheduleAction.bind(null, locale, id)}
                        className="mt-3"
                        pendingLabel={t("saving")}
                        submitLabel={t("saveSchedule")}
                      >
                        <p className="text-sm text-muted-foreground">{t("scheduleHelp")}</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`tz-${id}`}>{t("scheduleTimezone")}</Label>
                            <Input
                              defaultValue={schedule?.schedule_timezone ?? "America/Chicago"}
                              id={`tz-${id}`}
                              list="schedule-zones"
                              name="timezone"
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`url-${id}`}>{t("meetingLink")}</Label>
                            <Input
                              defaultValue={schedule?.default_meeting_url ?? ""}
                              id={`url-${id}`}
                              name="meetingUrl"
                              pattern="https://.*"
                              placeholder="https://"
                              type="url"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          {weekdays.map((weekday) => {
                            const window = hours.find((item) => item.weekday === weekday);
                            return (
                              <div
                                className="grid grid-cols-[8rem_1fr_1fr] items-center gap-2 text-sm"
                                key={weekday}
                              >
                                <span className="font-medium">{dayName(weekday)}</span>
                                <Input
                                  aria-label={t("startsAt", { day: dayName(weekday) })}
                                  defaultValue={window?.start ?? ""}
                                  name={`start.${weekday}`}
                                  step={1800}
                                  type="time"
                                />
                                <Input
                                  aria-label={t("endsAt", { day: dayName(weekday) })}
                                  defaultValue={window?.end ?? ""}
                                  name={`end.${weekday}`}
                                  step={1800}
                                  type="time"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </ActionForm>
                    </details>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
