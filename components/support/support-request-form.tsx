"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupportRequestAction } from "@/lib/support/actions";
import { initialSupportActionState } from "@/lib/support/action-state";
import {
  SUPPORT_DESCRIPTION_MAX,
  SUPPORT_SUBJECT_MAX,
  supportCategoryValues,
  supportLanguageValues,
  type SupportCategory,
  type SupportLanguage,
} from "@/lib/support/constants";
import { createSupportRequestSchema } from "@/lib/validation/support";

type SupportFormValues = {
  subject: string;
  category: SupportCategory;
  preferredLanguage: SupportLanguage;
  description: string;
  acknowledged: string | boolean;
};

export function SupportRequestForm({ locale }: { locale: AppLocale }) {
  const t = useTranslations("support");
  // One key per mounted form: repeated submissions stay idempotent server-side.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const validationSchema = createSupportRequestSchema({
    subject: t("subjectError"),
    description: t("descriptionError"),
    acknowledgment: t("acknowledgmentError"),
  });
  const form = useForm<SupportFormValues>({
    defaultValues: {
      subject: "",
      category: "general",
      preferredLanguage: locale,
      description: "",
      acknowledged: "",
    },
    resolver: zodResolver(validationSchema, undefined, { raw: true }),
  });
  const [state, action] = useActionState(
    createSupportRequestAction.bind(null, locale),
    initialSupportActionState,
  );
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        const data = new FormData();
        for (const [key, value] of Object.entries(values)) data.set(key, String(value));
        data.set("idempotencyKey", idempotencyKey);
        startTransition(() => action(data));
      })}
    >
      <div className="space-y-1.5">
        <Label htmlFor="support-subject">{t("subject")} *</Label>
        <Input
          aria-describedby={form.formState.errors.subject ? "support-subject-error" : undefined}
          aria-invalid={Boolean(form.formState.errors.subject)}
          id="support-subject"
          maxLength={SUPPORT_SUBJECT_MAX}
          {...form.register("subject")}
        />
        {form.formState.errors.subject?.message ? (
          <p className="text-sm text-destructive" id="support-subject-error" role="alert">
            {form.formState.errors.subject.message}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="support-category">{t("category")}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            id="support-category"
            {...form.register("category")}
          >
            {supportCategoryValues.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support-language">{t("preferredLanguage")}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            id="support-language"
            {...form.register("preferredLanguage")}
          >
            {supportLanguageValues.map((language) => (
              <option key={language} value={language}>
                {t(`languages.${language}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="support-description">{t("description")} *</Label>
        <Textarea
          aria-describedby={
            form.formState.errors.description ? "support-description-error" : "support-description-help"
          }
          aria-invalid={Boolean(form.formState.errors.description)}
          id="support-description"
          maxLength={SUPPORT_DESCRIPTION_MAX}
          rows={6}
          {...form.register("description")}
        />
        <p className="text-sm text-muted-foreground" id="support-description-help">
          {t("descriptionHelp")}
        </p>
        {form.formState.errors.description?.message ? (
          <p className="text-sm text-destructive" id="support-description-error" role="alert">
            {form.formState.errors.description.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
        <h2 className="text-base font-bold">{t("expectationsTitle")}</h2>
        <p className="text-sm leading-6" id="support-expectations-disclaimer">
          {t("expectationsDisclaimer")}
        </p>
        <p className="text-sm leading-6" id="support-expectations-expanded">
          {t("expectationsExpanded")}
        </p>
        <p className="text-sm font-semibold leading-6" id="support-expectations-household">
          {t("visibilityNotice")}
        </p>
        <div className="flex items-start gap-2">
          <input
            aria-describedby="support-expectations-disclaimer support-expectations-expanded support-expectations-household"
            className="mt-1 size-4"
            id="support-acknowledged"
            type="checkbox"
            value="on"
            {...form.register("acknowledged")}
          />
          <Label className="leading-6" htmlFor="support-acknowledged">
            {t("acknowledgmentLabel")}
          </Label>
        </div>
        {form.formState.errors.acknowledged?.message ? (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.acknowledged.message}
          </p>
        ) : null}
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {pending ? t("creating") : ""}
      </p>
      <Button disabled={pending} type="submit">
        {pending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}
