import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { StatusPill } from "@/components/services/status-badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { updateSpecialistAction } from "@/lib/services/config-actions";
import { deliveryMethodValues } from "@/lib/services/constants";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

type Capability = { service_type: string; language: string; delivery_method: string };

/** Every capability an administrator can grant, grouped by service. */
const capabilityGrid = [
  { service: "consultation", languages: ["en", "am", "es"] },
  { service: "iep_language_assistance", languages: ["am", "es"] },
] as const;

export default async function AdminSpecialistsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminConsole.specialistsPage" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const languages = await getTranslations({ locale, namespace: "services.languages" });
  const iepLanguages = await getTranslations({ locale, namespace: "services.iepLanguages" });
  const delivery = await getTranslations({ locale, namespace: "services.deliveryMethods" });
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.rpc("admin_list_specialists");
  const specialists = data ?? [];

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
                            deliveryMethodValues.map((method) => (
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
                  </div>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
