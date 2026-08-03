"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialOnboardingActionState } from "@/lib/onboarding/action-state";
import { updateHouseholdAction } from "@/lib/onboarding/actions";
import { createHouseholdNameSchema, type HouseholdNameInput } from "@/lib/validation/onboarding";

export function HouseholdEditForm({ householdName, locale }: { householdName: string; locale: AppLocale }) {
  const t = useTranslations("onboarding");
  const form = useForm<HouseholdNameInput>({
    defaultValues: { householdName },
    resolver: zodResolver(createHouseholdNameSchema(t("householdNameError"))),
  });
  const [state, action] = useActionState(
    updateHouseholdAction.bind(null, locale),
    initialOnboardingActionState,
  );
  const [pending, startTransition] = useTransition();
  const error = form.formState.errors.householdName;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        const data = new FormData();
        data.set("householdName", values.householdName);
        startTransition(() => action(data));
      })}
    >
      <div className="space-y-1.5">
        <Label htmlFor="editHouseholdName">{t("householdNameLabel")}</Label>
        <Input
          aria-describedby={
            error ? "edit-household-name-help edit-household-name-error" : "edit-household-name-help"
          }
          aria-invalid={Boolean(error)}
          id="editHouseholdName"
          maxLength={160}
          {...form.register("householdName")}
        />
        <p className="text-sm text-muted-foreground" id="edit-household-name-help">
          {t("householdNameHelp")}
        </p>
        {error?.message ? (
          <p className="text-sm text-destructive" id="edit-household-name-error" role="alert">
            {error.message}
          </p>
        ) : null}
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? t("updating") : t("update")}
      </Button>
    </form>
  );
}
