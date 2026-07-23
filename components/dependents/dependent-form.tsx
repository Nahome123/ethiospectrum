"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDependentAction, updateDependentAction } from "@/lib/dependents/actions";
import { initialDependentActionState } from "@/lib/dependents/action-state";
import { createDependentSchema } from "@/lib/validation/dependent";

type Values = {
  firstName: string;
  lastName: string;
  preferredName: string;
  birthYear: string;
  schoolDistrict: string;
  gradeLevel: string;
  notes: string;
};

type FieldName = Exclude<keyof Values, "notes">;

const textFields: { key: FieldName; label: FieldName; type: "number" | "text" }[] = [
  { key: "firstName", label: "firstName", type: "text" },
  { key: "lastName", label: "lastName", type: "text" },
  { key: "preferredName", label: "preferredName", type: "text" },
  { key: "birthYear", label: "birthYear", type: "number" },
  { key: "schoolDistrict", label: "schoolDistrict", type: "text" },
  { key: "gradeLevel", label: "gradeLevel", type: "text" },
];

export function DependentForm({
  locale,
  dependentId,
  initial,
}: {
  locale: AppLocale;
  dependentId?: string;
  initial?: Partial<Values>;
}) {
  const t = useTranslations("dependents");
  const validationSchema = createDependentSchema({
    firstName: t("firstNameError"),
    birthYear: t("birthYearError"),
    text: t("textError"),
  });
  const form = useForm<Values>({
    defaultValues: {
      firstName: "",
      lastName: "",
      preferredName: "",
      birthYear: "",
      schoolDistrict: "",
      gradeLevel: "",
      notes: "",
      ...initial,
    },
    resolver: zodResolver(validationSchema, undefined, { raw: true }),
  });
  const actionFunction = dependentId
    ? updateDependentAction.bind(null, locale, dependentId)
    : createDependentAction.bind(null, locale);
  const [state, action] = useActionState(actionFunction, initialDependentActionState);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        const data = new FormData();

        for (const [key, value] of Object.entries(values)) {
          data.set(key, value);
        }

        startTransition(() => action(data));
      })}
    >
      {textFields.map(({ key, label, type }) => {
        const error = form.formState.errors[key];
        const errorId = `${key}-error`;

        return (
          <div className="space-y-1.5" key={key}>
            <Label htmlFor={key}>{t(label)}</Label>
            <Input
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error)}
              id={key}
              max={type === "number" ? new Date().getUTCFullYear() : undefined}
              maxLength={
                key === "schoolDistrict"
                  ? 160
                  : key === "firstName" ||
                      key === "lastName" ||
                      key === "preferredName" ||
                      key === "gradeLevel"
                    ? 80
                    : undefined
              }
              min={type === "number" ? 1900 : undefined}
              type={type}
              {...form.register(key)}
            />
            {error?.message ? (
              <p className="text-sm text-destructive" id={errorId} role="alert">
                {error.message}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="space-y-1.5">
        <Label htmlFor="notes">{t("notes")}</Label>
        <p className="text-sm text-muted-foreground" id="notes-help">
          {t("notesHelp")}
        </p>
        <Textarea
          aria-describedby={form.formState.errors.notes ? "notes-help notes-error" : "notes-help"}
          aria-invalid={Boolean(form.formState.errors.notes)}
          id="notes"
          maxLength={2000}
          {...form.register("notes")}
        />
        {form.formState.errors.notes?.message ? (
          <p className="text-sm text-destructive" id="notes-error" role="alert">
            {form.formState.errors.notes.message}
          </p>
        ) : null}
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
