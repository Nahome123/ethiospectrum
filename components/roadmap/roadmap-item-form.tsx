"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useRef, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRoadmapItemAction, updateRoadmapItemAction } from "@/lib/roadmap/actions";
import { initialRoadmapActionState } from "@/lib/roadmap/action-state";
import {
  roadmapCategoryValues,
  roadmapPriorityValues,
  roadmapStatusValues,
  type RoadmapCategory,
  type RoadmapPriority,
  type RoadmapStatus,
} from "@/lib/roadmap/constants";
import { createRoadmapItemSchema } from "@/lib/validation/roadmap";

type RoadmapFormValues = {
  title: string;
  description: string;
  category: RoadmapCategory;
  priority: RoadmapPriority;
  status: RoadmapStatus;
  dueDate: string;
  dependentId: string;
  assignedTo: string;
};

type SelectOption = { id: string; label: string };

export function RoadmapItemForm({
  locale,
  itemId,
  initial,
  dependents,
  members,
  currentUserId,
  canAssignOthers,
}: {
  locale: AppLocale;
  itemId?: string;
  initial?: Partial<RoadmapFormValues> & {
    expectedUpdatedAt?: string;
    historicalDependentLabel?: string | null;
    historicalAssigneeLabel?: string | null;
  };
  dependents: SelectOption[];
  members: SelectOption[];
  currentUserId: string;
  canAssignOthers: boolean;
}) {
  const t = useTranslations("roadmap");
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const validationSchema = createRoadmapItemSchema({
    title: t("titleError"),
    description: t("descriptionError"),
    date: t("dueDateError"),
  });
  const form = useForm<RoadmapFormValues>({
    defaultValues: {
      title: "",
      description: "",
      category: "general",
      priority: "medium",
      status: "not_started",
      dueDate: "",
      dependentId: "",
      assignedTo: "",
      ...initial,
    },
    resolver: zodResolver(validationSchema, undefined, { raw: true }),
  });
  const actionFunction = itemId
    ? updateRoadmapItemAction.bind(null, locale, itemId)
    : createRoadmapItemAction.bind(null, locale);
  const [state, action] = useActionState(actionFunction, initialRoadmapActionState);
  const [pending, startTransition] = useTransition();
  const assignedTo = form.watch("assignedTo");
  const dependentId = form.watch("dependentId");
  const preservesHistoricalAssignee =
    !canAssignOthers && Boolean(initial?.assignedTo) && initial?.assignedTo !== currentUserId;
  const preservesHistoricalDependent =
    Boolean(initial?.dependentId) && !dependents.some((dependent) => dependent.id === initial?.dependentId);

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        const data = new FormData();
        for (const [key, value] of Object.entries(values)) data.set(key, value);
        if (itemId) {
          data.set("expectedUpdatedAt", initial?.expectedUpdatedAt ?? "");
        } else if (idempotencyInput.current) {
          if (!idempotencyInput.current.value) idempotencyInput.current.value = crypto.randomUUID();
          data.set("idempotencyKey", idempotencyInput.current.value);
        }
        startTransition(() => action(data));
      })}
    >
      {!itemId ? <input name="idempotencyKey" ref={idempotencyInput} type="hidden" /> : null}
      <div className="space-y-1.5">
        <Label htmlFor="roadmap-title">{t("title")} *</Label>
        <Input
          aria-describedby={form.formState.errors.title ? "roadmap-title-error" : undefined}
          aria-invalid={Boolean(form.formState.errors.title)}
          id="roadmap-title"
          maxLength={160}
          {...form.register("title")}
        />
        {form.formState.errors.title?.message ? (
          <p className="text-sm text-destructive" id="roadmap-title-error" role="alert">
            {form.formState.errors.title.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="roadmap-description">{t("description")}</Label>
        <Textarea
          aria-describedby={form.formState.errors.description ? "roadmap-description-error" : undefined}
          aria-invalid={Boolean(form.formState.errors.description)}
          id="roadmap-description"
          maxLength={4000}
          {...form.register("description")}
        />
        {form.formState.errors.description?.message ? (
          <p className="text-sm text-destructive" id="roadmap-description-error" role="alert">
            {form.formState.errors.description.message}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-category">{t("category")}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            id="roadmap-category"
            {...form.register("category")}
          >
            {roadmapCategoryValues.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-priority">{t("priority")}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            id="roadmap-priority"
            {...form.register("priority")}
          >
            {roadmapPriorityValues.map((priority) => (
              <option key={priority} value={priority}>
                {t(`priorities.${priority}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-status">{t("status")}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            id="roadmap-status"
            {...form.register("status")}
          >
            {roadmapStatusValues.map((status) => (
              <option key={status} value={status}>
                {t(`statuses.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-due-date">{t("dueDate")}</Label>
          <Input id="roadmap-due-date" type="date" {...form.register("dueDate")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-dependent">{t("dependent")}</Label>
          {preservesHistoricalDependent ? (
            <>
              <p className="text-sm text-muted-foreground">
                {initial?.historicalDependentLabel ?? t("archivedDependent")}
              </p>
              <input type="hidden" value={dependentId} {...form.register("dependentId")} />
            </>
          ) : (
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              id="roadmap-dependent"
              {...form.register("dependentId")}
            >
              <option value="">{t("noDependent")}</option>
              {dependents.map((dependent) => (
                <option key={dependent.id} value={dependent.id}>
                  {dependent.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="roadmap-assignee">{t("assignee")}</Label>
          {preservesHistoricalAssignee ? (
            <>
              <p className="text-sm text-muted-foreground">
                {initial?.historicalAssigneeLabel ?? t("assignedHouseholdMember")}
              </p>
              <input type="hidden" value={assignedTo} {...form.register("assignedTo")} />
            </>
          ) : (
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              id="roadmap-assignee"
              {...form.register("assignedTo")}
            >
              <option value="">{t("unassigned")}</option>
              {(canAssignOthers ? members : members.filter((member) => member.id === currentUserId)).map(
                (member) => (
                  <option key={member.id} value={member.id}>
                    {member.id === currentUserId ? t("assignToMe") : member.label}
                  </option>
                ),
              )}
            </select>
          )}
        </div>
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? (itemId ? t("saving") : t("creating")) : itemId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
