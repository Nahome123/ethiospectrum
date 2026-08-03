"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SafeMarkdown } from "@/components/resources/safe-markdown";
import { initialResourceActionState } from "@/lib/resources/action-state";
import { createResourceTranslation, updateResourceTranslation } from "@/lib/resources/translation-actions";

type TranslationLocale = "am" | "es";
type Content = { title: string; summary: string; body: string };

export function TranslationForm({
  locale,
  resourceId,
  translationLocale,
  english,
  translation,
}: {
  locale: AppLocale;
  resourceId: string;
  translationLocale: TranslationLocale;
  english: Content & { version: number };
  translation?: (Content & { id: string; version: number; isStale: boolean }) | null;
}) {
  const t = useTranslations("resourceWorkflow");
  const [body, setBody] = useState(translation?.body ?? "");
  const action = translation
    ? updateResourceTranslation.bind(null, locale, resourceId, translationLocale)
    : createResourceTranslation.bind(null, locale);
  const [state, formAction, pending] = useActionState(action, initialResourceActionState);
  return (
    <form
      action={formAction}
      aria-busy={pending}
      aria-label={t(translationLocale === "am" ? "amharicTranslation" : "spanishTranslation")}
      className="space-y-6"
      noValidate
    >
      <input name="resourceId" type="hidden" value={resourceId} />
      <input name="translationLocale" type="hidden" value={translationLocale} />
      {translation ? (
        <>
          <input name="translationId" type="hidden" value={translation.id} />
          <input name="expectedVersion" type="hidden" value={translation.version} />
        </>
      ) : null}
      <section aria-labelledby="english-source" className="rounded-lg border bg-muted/30 p-4">
        <h2 className="font-semibold" id="english-source">
          {t("canonicalEnglishSource")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("englishSourceVersion")}: {english.version}
        </p>
        <h3 className="mt-4 font-medium">{english.title}</h3>
        <p className="mt-2 text-sm">{english.summary}</p>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm">{english.body}</p>
      </section>
      {translation?.isStale ? (
        <p className="rounded-md border border-amber-500 p-3 text-sm" role="alert">
          {t("translationOutdated")}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {t(translationLocale === "am" ? "amharicTranslation" : "spanishTranslation")}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="translation-title">{t("fieldTitle")}</Label>
        <Input
          defaultValue={translation?.title}
          id="translation-title"
          maxLength={160}
          name="title"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="translation-summary">{t("summary")}</Label>
        <Textarea
          defaultValue={translation?.summary}
          id="translation-summary"
          maxLength={500}
          name="summary"
          required
          rows={4}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="translation-body">{t("translationMarkdownBody")}</Label>
        <Textarea
          id="translation-body"
          maxLength={50000}
          name="body"
          onChange={(event) => setBody(event.currentTarget.value)}
          required
          rows={16}
          value={body}
        />
      </div>
      <section aria-labelledby="translation-preview" className="rounded-lg border p-4">
        <h2 className="font-semibold" id="translation-preview">
          {t("translationPreview")}
        </h2>
        <div className="mt-3">
          <SafeMarkdown body={body} />
        </div>
      </section>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm text-emerald-700" role="status">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? t("saving") : translation ? t("saveTranslation") : t("createTranslation")}
      </Button>
    </form>
  );
}
