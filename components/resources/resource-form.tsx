"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResourceCoverPlaceholder } from "@/components/resources/resource-cover-placeholder";
import { initialResourceActionState } from "@/lib/resources/action-state";
import { resourceCategoryValues, type ResourceCategory } from "@/lib/resources/constants";
import { createResource, updateResource } from "@/lib/resources/actions";

type Values = { slug: string; category: ResourceCategory; title: string; summary: string; body: string };
type AccountHolder = { id: string; label: string };

export function ResourceForm({
  locale,
  resourceId,
  expectedVersion,
  initial,
  accountHolders = [],
}: {
  locale: AppLocale;
  resourceId?: string;
  expectedVersion?: number;
  initial?: Partial<Values>;
  accountHolders?: AccountHolder[];
}) {
  const t = useTranslations("resourceWorkflow");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const action = resourceId
    ? updateResource.bind(null, locale, resourceId)
    : createResource.bind(null, locale);
  const [state, formAction, pending] = useActionState(action, initialResourceActionState);
  const values: Values = { slug: "", category: "general", title: "", summary: "", body: "", ...initial };
  const [category, setCategory] = useState<ResourceCategory>(values.category);
  return (
    <form action={formAction} className="space-y-5">
      {!resourceId ? <input name="idempotencyKey" type="hidden" value={idempotencyKey} /> : null}
      {resourceId ? <input name="expectedVersion" type="hidden" value={expectedVersion ?? ""} /> : null}
      <p className="rounded-md bg-secondary/60 px-4 py-3 text-sm text-secondary-foreground">
        {t("formRequirements")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="resource-slug">
            {t("slug")}{" "}
            <span aria-hidden="true" className="text-destructive">
              ({t("required")})
            </span>
          </Label>
          <Input
            aria-describedby="resource-slug-hint"
            defaultValue={values.slug}
            id="resource-slug"
            maxLength={120}
            minLength={3}
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
          <p className="text-sm text-muted-foreground" id="resource-slug-hint">
            {t("slugHint")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resource-category">{t("category")}</Label>
          <select
            aria-describedby="resource-category-hint"
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            id="resource-category"
            name="category"
            onChange={(event) => setCategory(event.currentTarget.value as ResourceCategory)}
            value={category}
          >
            {resourceCategoryValues.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground" id="resource-category-hint">
            {t("categoryHint")}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("coverPreview")}</p>
        <ResourceCoverPlaceholder
          category={category}
          categoryLabel={t(`categories.${category}`)}
          className="max-w-md rounded-xl border border-border"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resource-title">
          {t("fieldTitle")}{" "}
          <span aria-hidden="true" className="text-destructive">
            ({t("required")})
          </span>
        </Label>
        <Input
          aria-describedby="resource-title-hint"
          defaultValue={values.title}
          id="resource-title"
          maxLength={160}
          minLength={3}
          name="title"
          required
        />
        <p className="text-sm text-muted-foreground" id="resource-title-hint">
          {t("titleHint")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resource-summary">
          {t("summary")}{" "}
          <span aria-hidden="true" className="text-destructive">
            ({t("required")})
          </span>
        </Label>
        <Textarea
          aria-describedby="resource-summary-hint"
          defaultValue={values.summary}
          id="resource-summary"
          maxLength={500}
          minLength={10}
          name="summary"
          required
          rows={4}
        />
        <p className="text-sm text-muted-foreground" id="resource-summary-hint">
          {t("summaryHint")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resource-body">
          {t("body")}{" "}
          <span aria-hidden="true" className="text-destructive">
            ({t("required")})
          </span>
        </Label>
        <Textarea
          aria-describedby="resource-body-hint"
          defaultValue={values.body}
          id="resource-body"
          maxLength={50000}
          minLength={50}
          name="body"
          required
          rows={16}
        />
        <p className="text-sm text-muted-foreground" id="resource-body-hint">
          {t("bodyHint")}
        </p>
      </div>
      {!resourceId ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("availableTo")}</legend>
          <p className="text-sm text-muted-foreground" id="resource-accounts-hint">
            {t("availableToHint")}
          </p>
          {accountHolders.length ? (
            <div aria-describedby="resource-accounts-hint" className="grid gap-2 sm:grid-cols-2">
              {accountHolders.map((account) => (
                <label
                  className="flex min-h-11 items-center gap-3 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  key={account.id}
                >
                  <input className="size-4" name="accountIds" type="checkbox" value={account.id} />
                  <span>{account.label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>
      ) : null}
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
