"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { SlotFields } from "@/components/services/slot-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import { createConsultationRequestAction } from "@/lib/services/actions";
import { initialServiceActionState } from "@/lib/services/action-state";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  RELEVANT_INFORMATION_MAX,
  consultationCategoryValues,
  sessionLanguageValues,
  type ConsultationCategory,
} from "@/lib/services/constants";

type Option = { id: string; name: string; preferredLanguage?: string | null };
type Topic = { key: string; category: string; label: string };

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

export function ConsultationRequestForm({
  dependents,
  locale,
  topics,
}: {
  dependents: Option[];
  locale: AppLocale;
  topics: Topic[];
}) {
  const t = useTranslations("services.form");
  const categories = useTranslations("services.categories");
  const languages = useTranslations("services.languages");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [category, setCategory] = useState<ConsultationCategory>("general_guidance");
  const [schedulingMode, setSchedulingMode] = useState<"direct" | "propose">("direct");
  const [state, action, pending] = useActionState(
    createConsultationRequestAction.bind(null, locale),
    initialServiceActionState,
  );
  const availableTopics = topics.filter((topic) => topic.category === category);

  return (
    <form action={action} className="space-y-6">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="space-y-1.5">
        <Label htmlFor="consultation-dependent">{t("dependent")} *</Label>
        <select className={selectClass} id="consultation-dependent" name="dependentId" required>
          {dependents.map((dependent) => (
            <option key={dependent.id} value={dependent.id}>
              {dependent.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("serviceCategory")} *</legend>
        {consultationCategoryValues.map((value) => (
          <label className="flex items-start gap-2 text-sm" key={value}>
            <input
              checked={category === value}
              className="mt-1 size-4"
              name="category"
              onChange={() => setCategory(value)}
              type="radio"
              value={value}
            />
            <span>{categories(value)}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="consultation-topic">{t("topic")}</Label>
          <select className={selectClass} id="consultation-topic" key={category} name="topicKey">
            <option value="">{t("topicAny")}</option>
            {availableTopics.map((topic) => (
              <option key={topic.key} value={topic.key}>
                {topic.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="consultation-language">{t("preferredLanguage")} *</Label>
          <select
            className={selectClass}
            defaultValue={locale}
            id="consultation-language"
            name="preferredLanguage"
          >
            {sessionLanguageValues.map((value) => (
              <option key={value} value={value}>
                {languages(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="consultation-description">{t("needDescription")} *</Label>
        <Textarea
          aria-describedby="consultation-description-help"
          id="consultation-description"
          maxLength={DESCRIPTION_MAX}
          minLength={DESCRIPTION_MIN}
          name="description"
          required
          rows={5}
        />
        <p className="text-sm text-muted-foreground" id="consultation-description-help">
          {t("needDescriptionHelp")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="consultation-relevant">{t("relevantInformation")}</Label>
        <Textarea
          aria-describedby="consultation-relevant-help"
          id="consultation-relevant"
          maxLength={RELEVANT_INFORMATION_MAX}
          name="relevantInformation"
          rows={4}
        />
        <p className="text-sm text-muted-foreground" id="consultation-relevant-help">
          {t("relevantInformationHelp")}
        </p>
      </div>
      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">{t("schedulingTitle")}</legend>
        <div className="space-y-1.5">
          <Label htmlFor="consultation-scheduling">{t("schedulingMode")} *</Label>
          <select
            aria-describedby="consultation-scheduling-help"
            className={selectClass}
            id="consultation-scheduling"
            name="schedulingMode"
            onChange={(event) => setSchedulingMode(event.target.value === "propose" ? "propose" : "direct")}
            value={schedulingMode}
          >
            <option value="direct">{t("schedulingDirect")}</option>
            <option value="propose">{t("schedulingPropose")}</option>
          </select>
          <p className="text-sm text-muted-foreground" id="consultation-scheduling-help">
            {schedulingMode === "direct" ? t("schedulingDirectHelp") : t("schedulingProposeHelp")}
          </p>
        </div>
        <SlotFields
          deliveryMethod="remote"
          familyRequest
          idPrefix={`consultation-${schedulingMode}`}
          key={schedulingMode}
          maxSlots={schedulingMode === "direct" ? 1 : 3}
          minSlots={schedulingMode === "direct" ? 1 : 2}
        />
      </fieldset>
      <p className="rounded-xl border bg-secondary/40 p-4 text-sm leading-6">{t("nextStepsConsultation")}</p>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} size="lg" type="submit">
        {pending ? t("submitting") : t("submitConsultation")}
      </Button>
    </form>
  );
}
