import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/services/action-form";
import { StatusPill } from "@/components/services/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import {
  saveConsultationTopicAction,
  saveServiceFeeAction,
  updateServiceAction,
} from "@/lib/services/config-actions";
import { formatCents, requestableServiceTypes } from "@/lib/services/constants";
import { listConsultationTopics, listServices } from "@/lib/services/server";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server";

function text(value: unknown, locale: string, field: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const entry = (value as Record<string, unknown>)[locale];
  if (field === "") return typeof entry === "string" ? entry : "";
  if (!entry || typeof entry !== "object") return "";
  const result = (entry as Record<string, unknown>)[field];
  return typeof result === "string" ? result : "";
}

function dollars(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export default async function AdminServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = localeParam as AppLocale;
  const t = await getTranslations({ locale, namespace: "adminConsole.config" });
  const types = await getTranslations({ locale, namespace: "services.types" });
  const categories = await getTranslations({ locale, namespace: "services.categories" });
  const supabase = await createServerComponentSupabaseClient();
  const [services, topics, feesResult] = await Promise.all([
    listServices(),
    listConsultationTopics(true),
    supabase.from("service_fees").select("*").order("created_at"),
  ]);
  const fees = feesResult.data ?? [];

  return (
    <section className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </div>

      <section aria-labelledby="services-heading" className="space-y-4">
        <h2 className="text-xl font-bold" id="services-heading">
          {t("services")}
        </h2>
        {services.map((service) => (
          <details className="rounded-2xl border bg-white p-5" key={service.id}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 font-semibold">
              <span>
                {types(service.service_type)} ·{" "}
                {service.service_type === "rbt_bootcamp"
                  ? service.price_cents === null
                    ? t("stripePrice")
                    : `${formatCents(service.price_cents, locale)} / ${t("month")}`
                  : formatCents(service.price_cents, locale)}
              </span>
              <StatusPill
                label={service.active ? t("active") : t("inactive")}
                tone={service.active ? "success" : "neutral"}
              />
            </summary>
            <ActionForm
              action={updateServiceAction.bind(null, locale, service.id)}
              className="mt-4"
              pendingLabel={t("saving")}
              submitLabel={t("save")}
            >
              <input name="expectedVersion" type="hidden" value={service.version} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`name-${service.id}`}>{t("name")}</Label>
                  <Input
                    defaultValue={service.name}
                    id={`name-${service.id}`}
                    maxLength={120}
                    name="name"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`price-${service.id}`}>
                    {service.service_type === "rbt_bootcamp" ? t("displayPrice") : t("price")}
                  </Label>
                  <Input
                    defaultValue={dollars(service.price_cents)}
                    id={`price-${service.id}`}
                    inputMode="decimal"
                    name="price"
                    pattern="\d{1,5}(\.\d{1,2})?"
                    required={service.service_type !== "rbt_bootcamp"}
                  />
                  {service.service_type === "rbt_bootcamp" ? (
                    <p className="text-xs text-muted-foreground">{t("displayPriceHelp")}</p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`description-${service.id}`}>{t("englishDescription")}</Label>
                <Textarea
                  defaultValue={service.description}
                  id={`description-${service.id}`}
                  maxLength={2000}
                  name="description"
                  required
                  rows={3}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["am", "es"] as const).map((language) => (
                  <div className="space-y-1.5" key={language}>
                    <Label htmlFor={`${language}-description-${service.id}`}>
                      {t(`descriptionIn.${language}`)}
                    </Label>
                    <Textarea
                      defaultValue={text(service.localized, language, "description")}
                      id={`${language}-description-${service.id}`}
                      maxLength={2000}
                      name={`${language}.description`}
                      rows={3}
                    />
                  </div>
                ))}
              </div>
              {service.service_type !== "rbt_bootcamp" ? (
                <>
                  <div className="space-y-1.5 sm:max-w-xs">
                    <Label htmlFor={`followups-${service.id}`}>{t("includedFollowUps")}</Label>
                    <Input
                      defaultValue={service.included_follow_ups}
                      id={`followups-${service.id}`}
                      max={5}
                      min={0}
                      name="includedFollowUps"
                      type="number"
                    />
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{t("standardInstructions")}</legend>
                    {(["en", "am", "es"] as const).map((language) => (
                      <Input
                        aria-label={t(`instructionsIn.${language}`)}
                        defaultValue={text(service.standard_instructions, language, "")}
                        key={language}
                        maxLength={1000}
                        name={`instructions.${language}`}
                        placeholder={t(`instructionsIn.${language}`)}
                      />
                    ))}
                  </fieldset>
                </>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked={service.active} name="active" type="checkbox" />
                {t("activeLabel")}
              </label>
            </ActionForm>
          </details>
        ))}
      </section>

      <section aria-labelledby="fees-heading" className="space-y-4">
        <h2 className="text-xl font-bold" id="fees-heading">
          {t("fees")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("feesHelp")}</p>
        {[...fees, null].map((fee) => (
          <details
            className="rounded-2xl border bg-white p-5"
            key={fee?.id ?? "new"}
            open={fee === null && fees.length === 0 ? false : undefined}
          >
            <summary className="cursor-pointer font-semibold">
              {fee
                ? `${fee.name} · ${types(fee.service_type)} · ${formatCents(fee.amount_cents, locale)}${fee.active ? "" : ` (${t("inactive")})`}`
                : t("addFee")}
            </summary>
            <ActionForm
              action={saveServiceFeeAction.bind(null, locale)}
              className="mt-4"
              pendingLabel={t("saving")}
              submitLabel={t("save")}
            >
              <input name="feeId" type="hidden" value={fee?.id ?? ""} />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`fee-service-${fee?.id ?? "new"}`}>{t("service")}</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                    defaultValue={fee?.service_type ?? "consultation"}
                    id={`fee-service-${fee?.id ?? "new"}`}
                    name="serviceType"
                  >
                    {requestableServiceTypes.map((type) => (
                      <option key={type} value={type}>
                        {types(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`fee-name-${fee?.id ?? "new"}`}>{t("name")}</Label>
                  <Input
                    defaultValue={fee?.name}
                    id={`fee-name-${fee?.id ?? "new"}`}
                    maxLength={120}
                    name="name"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`fee-amount-${fee?.id ?? "new"}`}>{t("amount")}</Label>
                  <Input
                    defaultValue={fee ? dollars(fee.amount_cents) : ""}
                    id={`fee-amount-${fee?.id ?? "new"}`}
                    inputMode="decimal"
                    name="amount"
                    pattern="\d{1,5}(\.\d{1,2})?"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`fee-description-${fee?.id ?? "new"}`}>{t("feeDisclosure")}</Label>
                <Textarea
                  defaultValue={fee?.description}
                  id={`fee-description-${fee?.id ?? "new"}`}
                  maxLength={1000}
                  name="description"
                  required
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked={fee?.active ?? true} name="active" type="checkbox" />
                {t("feeActive")}
              </label>
            </ActionForm>
          </details>
        ))}
      </section>

      <section aria-labelledby="topics-heading" className="space-y-4">
        <h2 className="text-xl font-bold" id="topics-heading">
          {t("topics")}
        </h2>
        {[...topics, null].map((topic) => (
          <details className="rounded-2xl border bg-white p-5" key={topic?.id ?? "new"}>
            <summary className="cursor-pointer font-semibold">
              {topic
                ? `${text(topic.labels, locale, "") || text(topic.labels, "en", "")} · ${categories(topic.category)}${topic.active ? "" : ` (${t("inactive")})`}`
                : t("addTopic")}
            </summary>
            <ActionForm
              action={saveConsultationTopicAction.bind(null, locale)}
              className="mt-4"
              pendingLabel={t("saving")}
              submitLabel={t("save")}
            >
              <input name="topicId" type="hidden" value={topic?.id ?? ""} />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`topic-key-${topic?.id ?? "new"}`}>{t("topicKey")}</Label>
                  <Input
                    defaultValue={topic?.topic_key}
                    id={`topic-key-${topic?.id ?? "new"}`}
                    name="topicKey"
                    pattern="[a-z][a-z0-9_]{1,62}"
                    readOnly={Boolean(topic)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`topic-category-${topic?.id ?? "new"}`}>{t("category")}</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                    defaultValue={topic?.category ?? "general_guidance"}
                    id={`topic-category-${topic?.id ?? "new"}`}
                    name="category"
                  >
                    {(["general_guidance", "behavioral_educational"] as const).map((value) => (
                      <option key={value} value={value}>
                        {categories(value)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`topic-order-${topic?.id ?? "new"}`}>{t("sortOrder")}</Label>
                  <Input
                    defaultValue={topic?.sort_order ?? 100}
                    id={`topic-order-${topic?.id ?? "new"}`}
                    min={0}
                    name="sortOrder"
                    type="number"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {(["en", "am", "es"] as const).map((language) => (
                  <div className="space-y-1.5" key={language}>
                    <Label htmlFor={`topic-${language}-${topic?.id ?? "new"}`}>
                      {t(`labelIn.${language}`)}
                    </Label>
                    <Input
                      defaultValue={topic ? text(topic.labels, language, "") : ""}
                      id={`topic-${language}-${topic?.id ?? "new"}`}
                      maxLength={120}
                      name={`label.${language}`}
                      required={language === "en"}
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input defaultChecked={topic?.active ?? true} name="active" type="checkbox" />
                {t("activeLabel")}
              </label>
            </ActionForm>
          </details>
        ))}
      </section>
    </section>
  );
}
