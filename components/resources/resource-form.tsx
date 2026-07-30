"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialResourceActionState } from "@/lib/resources/action-state";
import { resourceCategoryValues, type ResourceCategory } from "@/lib/resources/constants";
import { createResource, updateResource } from "@/lib/resources/actions";

type Values = { slug: string; category: ResourceCategory; title: string; summary: string; body: string };

export function ResourceForm({
  locale,
  resourceId,
  expectedVersion,
  initial,
}: {
  locale: AppLocale;
  resourceId?: string;
  expectedVersion?: number;
  initial?: Partial<Values>;
}) {
  const t = useTranslations("resources");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const action = resourceId
    ? updateResource.bind(null, locale, resourceId)
    : createResource.bind(null, locale);
  const [state, formAction, pending] = useActionState(action, initialResourceActionState);
  const values: Values = { slug: "", category: "general", title: "", summary: "", body: "", ...initial };
  return (
    <form action={formAction} className="space-y-5" noValidate>
      {!resourceId ? <input name="idempotencyKey" type="hidden" value={idempotencyKey} /> : null}
      {resourceId ? <input name="expectedVersion" type="hidden" value={expectedVersion ?? ""} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="resource-slug">{t("slug")}</Label>
          <Input defaultValue={values.slug} id="resource-slug" maxLength={120} name="slug" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resource-category">{t("category")}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            defaultValue={values.category}
            id="resource-category"
            name="category"
          >
            {resourceCategoryValues.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resource-title">{t("fieldTitle")}</Label>
        <Input defaultValue={values.title} id="resource-title" maxLength={160} name="title" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resource-summary">{t("summary")}</Label>
        <Textarea
          defaultValue={values.summary}
          id="resource-summary"
          maxLength={500}
          name="summary"
          required
          rows={4}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resource-body">{t("body")}</Label>
        <Textarea
          defaultValue={values.body}
          id="resource-body"
          maxLength={50000}
          name="body"
          required
          rows={16}
        />
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? t("saving") : resourceId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
