"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialResourceActionState } from "@/lib/resources/action-state";
import { updateResourceDiscoveryMetadata } from "@/lib/resources/actions";
import { resourceTypeValues, type ResourceType } from "@/lib/resources/constants";

export function ResourceDiscoveryForm({
  expectedVersion,
  featuredRank,
  locale,
  resourceId,
  resourceType,
}: {
  expectedVersion: number;
  featuredRank: number | null;
  locale: AppLocale;
  resourceId: string;
  resourceType: ResourceType;
}) {
  const t = useTranslations("resourceWorkflow");
  const [state, action, pending] = useActionState(
    updateResourceDiscoveryMetadata.bind(null, locale, resourceId),
    initialResourceActionState,
  );
  return (
    <form action={action} className="space-y-4" noValidate>
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <div className="grid gap-4 sm:grid-cols-2" key={expectedVersion}>
        <div className="space-y-1.5">
          <Label htmlFor="resource-type">{t("resourceType")}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            defaultValue={resourceType}
            id="resource-type"
            name="resourceType"
          >
            {resourceTypeValues.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="featured-rank">{t("featuredRank")}</Label>
          <Input
            defaultValue={featuredRank ?? ""}
            id="featured-rank"
            max={1000}
            min={1}
            name="featuredRank"
            type="number"
          />
          <p className="text-sm text-muted-foreground">{t("featuredRankHint")}</p>
        </div>
      </div>
      {state.status !== "idle" ? (
        <p
          className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} type="submit" variant="outline">
        {pending ? t("saving") : t("saveDiscovery")}
      </Button>
    </form>
  );
}
