"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { completeOnboardingAction } from "@/lib/onboarding/actions";
import { initialOnboardingActionState } from "@/lib/onboarding/action-state";
import { createOnboardingSchema, type OnboardingInput } from "@/lib/validation/onboarding";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function OnboardingForm({
  locale,
  profile,
}: {
  locale: AppLocale;
  profile: {
    first_name: string | null;
    last_name: string | null;
    preferred_locale: string;
    timezone: string;
  } | null;
}) {
  const t = useTranslations("onboarding");
  const schema = createOnboardingSchema({
    householdName: t("householdNameError"),
    consent: t("consentError"),
    firstName: t("firstNameError"),
    lastName: t("lastNameError"),
    preferredLocale: t("preferredLocaleError"),
    timezone: t("timezoneError"),
  });
  const form = useForm<OnboardingInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      consentAccepted: false,
      firstName: profile?.first_name ?? "",
      householdName: "",
      lastName: profile?.last_name ?? "",
      preferredLocale:
        profile?.preferred_locale === "en" ||
        profile?.preferred_locale === "am" ||
        profile?.preferred_locale === "es"
          ? profile.preferred_locale
          : locale,
      timezone: profile?.timezone || getBrowserTimeZone(),
    },
  });
  const [state, action] = useActionState(
    completeOnboardingAction.bind(null, locale),
    initialOnboardingActionState,
  );
  const [isTransitioning, startTransition] = useTransition();

  function submit(values: OnboardingInput) {
    const data = new FormData();
    data.set("firstName", values.firstName);
    data.set("lastName", values.lastName);
    data.set("householdName", values.householdName);
    data.set("preferredLocale", values.preferredLocale);
    data.set("timezone", values.timezone);
    if (values.consentAccepted) data.set("consentAccepted", "on");
    startTransition(() => action(data));
  }

  const pending = isTransitioning;
  const errors = form.formState.errors;

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-4">
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">{t("personalInformation")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={errors.firstName?.message}
            id="onboarding-first-name"
            label={t("firstNameLabel")}
            required
          >
            <Input
              id="onboarding-first-name"
              autoComplete="given-name"
              maxLength={80}
              required
              aria-describedby={errors.firstName ? "onboarding-first-name-error" : undefined}
              {...form.register("firstName")}
            />
          </Field>
          <Field error={errors.lastName?.message} id="onboarding-last-name" label={t("lastNameLabel")}>
            <Input
              id="onboarding-last-name"
              autoComplete="family-name"
              maxLength={80}
              aria-describedby={errors.lastName ? "onboarding-last-name-error" : undefined}
              {...form.register("lastName")}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={errors.preferredLocale?.message}
            id="onboarding-preferred-locale"
            label={t("preferredLocaleLabel")}
            required
          >
            <select
              id="onboarding-preferred-locale"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              required
              aria-describedby={errors.preferredLocale ? "onboarding-preferred-locale-error" : undefined}
              {...form.register("preferredLocale")}
            >
              <option value="en">{t("languageEnglish")}</option>
              <option value="am">{t("languageAmharic")}</option>
              <option value="es">{t("languageSpanish")}</option>
            </select>
          </Field>
          <Field
            error={errors.timezone?.message}
            help={t("timezoneHelp")}
            id="onboarding-timezone"
            label={t("timezoneLabel")}
            required
          >
            <Input
              id="onboarding-timezone"
              autoComplete="off"
              maxLength={64}
              placeholder={t("timezonePlaceholder")}
              required
              spellCheck={false}
              aria-describedby={errors.timezone ? "onboarding-timezone-error" : "onboarding-timezone-help"}
              {...form.register("timezone")}
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">{t("householdInformation")}</legend>
        <Field
          error={errors.householdName?.message}
          help={t("householdNameHelp")}
          id="onboarding-household-name"
          label={t("householdNameLabel")}
          required
        >
          <Input
            id="onboarding-household-name"
            autoComplete="organization"
            maxLength={160}
            required
            aria-describedby={
              errors.householdName ? "onboarding-household-name-error" : "onboarding-household-name-help"
            }
            {...form.register("householdName")}
          />
        </Field>
      </fieldset>
      <div className="space-y-1.5">
        <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          {t("consentNotice")}
        </p>
        <Label htmlFor="onboarding-consent" className="flex items-start gap-2 leading-5">
          <input
            id="onboarding-consent"
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            aria-describedby={errors.consentAccepted ? "onboarding-consent-error" : undefined}
            aria-required="true"
            required
            {...form.register("consentAccepted")}
          />
          {t("consentLabel")}
        </Label>
        {errors.consentAccepted?.message && (
          <p id="onboarding-consent-error" role="alert" className="text-sm text-destructive">
            {errors.consentAccepted.message}
          </p>
        )}
      </div>
      {state.status === "error" && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          <p>{state.message}</p>
        </div>
      )}
      <Button className="min-h-11 w-full" size="lg" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? t("pending") : t("submit")}
      </Button>
    </form>
  );
}

function Field({
  children,
  error,
  help,
  id,
  label,
  required = false,
}: {
  children: React.ReactNode;
  error?: string;
  help?: string;
  id: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {children}
      {help ? (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
