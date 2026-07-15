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

export function OnboardingForm({ locale }: { locale: AppLocale }) {
  const t = useTranslations("onboarding");
  const schema = createOnboardingSchema({
    householdName: t("householdNameError"),
    consent: t("consentError"),
  });
  const form = useForm<OnboardingInput>({
    resolver: zodResolver(schema),
    defaultValues: { householdName: "", consentAccepted: false },
  });
  const [state, action] = useActionState(
    completeOnboardingAction.bind(null, locale),
    initialOnboardingActionState,
  );
  const [isTransitioning, startTransition] = useTransition();

  function submit(values: OnboardingInput) {
    const data = new FormData();
    data.set("householdName", values.householdName);
    if (values.consentAccepted) data.set("consentAccepted", "on");
    startTransition(() => action(data));
  }

  const pending = isTransitioning;
  const errors = form.formState.errors;

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="householdName">{t("householdNameLabel")}</Label>
        <Input id="householdName" autoComplete="off" maxLength={160} {...form.register("householdName")} />
        <p className="text-sm text-muted-foreground">{t("householdNameHelp")}</p>
        {errors.householdName?.message && (
          <p role="alert" className="text-sm text-destructive">
            {errors.householdName.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          {t("consentNotice")}
        </p>
        <Label htmlFor="consentAccepted">
          <input
            id="consentAccepted"
            type="checkbox"
            className="size-4 accent-primary"
            {...form.register("consentAccepted")}
          />
          {t("consentLabel")}
        </Label>
        {errors.consentAccepted?.message && (
          <p role="alert" className="text-sm text-destructive">
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
