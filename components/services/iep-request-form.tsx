"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import { createIepRequestAction } from "@/lib/services/actions";
import { initialServiceActionState } from "@/lib/services/action-state";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  LOCATION_DETAILS_MAX,
  RELEVANT_INFORMATION_MAX,
  deliveryMethodValues,
  iepLanguageValues,
  iepServiceValues,
  inPersonLocationValues,
  type DeliveryMethod,
  type InPersonLocation,
} from "@/lib/services/constants";

type Option = { id: string; name: string; preferredLanguage?: string | null };
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

export function IepRequestForm({ dependents, locale }: { dependents: Option[]; locale: AppLocale }) {
  const t = useTranslations("services.form");
  const iepLanguages = useTranslations("services.iepLanguages");
  const activities = useTranslations("services.activities");
  const deliveryMethods = useTranslations("services.deliveryMethods");
  const locations = useTranslations("services.locations");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [delivery, setDelivery] = useState<DeliveryMethod>("remote");
  const [location, setLocation] = useState<InPersonLocation | "">("");
  const [state, action, pending] = useActionState(
    createIepRequestAction.bind(null, locale),
    initialServiceActionState,
  );
  const today = new Date().toISOString().slice(0, 10);
  const defaultLanguage = dependents[0]?.preferredLanguage === "es" || locale === "es" ? "es" : "am";

  return (
    <form action={action} className="space-y-6">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="iep-dependent">{t("dependent")} *</Label>
          <select className={selectClass} id="iep-dependent" name="dependentId" required>
            {dependents.map((dependent) => (
              <option key={dependent.id} value={dependent.id}>
                {dependent.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iep-language">{t("language")} *</Label>
          <select className={selectClass} defaultValue={defaultLanguage} id="iep-language" name="language">
            {iepLanguageValues.map((value) => (
              <option key={value} value={value}>
                {iepLanguages(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("iepServices")} *</legend>
        <p className="text-sm text-muted-foreground">{t("iepServicesHelp")}</p>
        {iepServiceValues.map((value) => (
          <label className="flex items-start gap-2 text-sm" key={value}>
            <input
              className="mt-1 size-4"
              defaultChecked={value === "iep_explanation"}
              name="services"
              type="checkbox"
              value={value}
            />
            <span>
              <span className="font-semibold">{activities(value)}</span>
              <span className="block text-muted-foreground">{t(`iepServiceHelp.${value}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("deliveryPreference")} *</legend>
        <div className="flex flex-wrap gap-4">
          {deliveryMethodValues.map((value) => (
            <label className="flex items-center gap-2 text-sm" key={value}>
              <input
                checked={delivery === value}
                className="size-4"
                name="deliveryMethod"
                onChange={() => setDelivery(value)}
                type="radio"
                value={value}
              />
              {deliveryMethods(value)}
            </label>
          ))}
        </div>
      </fieldset>
      {delivery === "in_person" ? (
        <div className="grid gap-4 rounded-xl border bg-secondary/30 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="iep-location">{t("locationType")} *</Label>
            <select
              className={selectClass}
              id="iep-location"
              name="locationType"
              onChange={(event) => setLocation(event.target.value as InPersonLocation | "")}
              required
              value={location}
            >
              <option value="">{t("chooseLocation")}</option>
              {inPersonLocationValues.map((value) => (
                <option key={value} value={value}>
                  {locations(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iep-location-details">
              {t("locationDetails")}
              {location === "school_meeting" || location === "mutually_agreed" ? " *" : ""}
            </Label>
            <Input
              id="iep-location-details"
              maxLength={LOCATION_DETAILS_MAX}
              name="locationDetails"
              placeholder={t("locationDetailsPlaceholder")}
              required={location === "school_meeting" || location === "mutually_agreed"}
            />
          </div>
          <p className="text-sm text-muted-foreground sm:col-span-2">{t("travelNotice")}</p>
        </div>
      ) : (
        <input name="locationType" type="hidden" value="" />
      )}
      <div className="space-y-1.5 sm:max-w-xs">
        <Label htmlFor="iep-meeting-date">{t("meetingDate")}</Label>
        <Input id="iep-meeting-date" min={today} name="meetingDate" type="date" />
        <p className="text-sm text-muted-foreground">{t("meetingDateHelp")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="iep-description">{t("requestedService")} *</Label>
        <Textarea
          id="iep-description"
          maxLength={DESCRIPTION_MAX}
          minLength={DESCRIPTION_MIN}
          name="description"
          required
          rows={5}
        />
        <p className="text-sm text-muted-foreground">{t("requestedServiceHelp")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="iep-relevant">{t("relevantIepInformation")}</Label>
        <Textarea
          id="iep-relevant"
          maxLength={RELEVANT_INFORMATION_MAX}
          name="relevantInformation"
          rows={4}
        />
        <p className="text-sm text-muted-foreground">{t("relevantIepInformationHelp")}</p>
      </div>
      <p className="rounded-xl border bg-secondary/40 p-4 text-sm leading-6">{t("nextStepsIep")}</p>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} size="lg" type="submit">
        {pending ? t("submitting") : t("submitIep")}
      </Button>
    </form>
  );
}
