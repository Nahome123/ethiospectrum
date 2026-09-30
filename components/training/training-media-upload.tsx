"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/i18n/routing";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  finishTrainingMediaUploadAction,
  prepareTrainingMediaUploadAction,
} from "@/lib/training/admin-actions";

const accepts = {
  video: "video/mp4,video/webm,video/x-m4v,.mp4,.webm,.m4v",
  resource:
    "application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pdf,.txt,.docx,.pptx",
} as const;

/** Administrator upload of a private lesson video or resource (served to subscribers via signed URLs). */
export function TrainingMediaUpload({
  kind,
  lessonId,
  locale,
}: {
  kind: "video" | "resource";
  lessonId: string;
  locale: AppLocale;
}) {
  const t = useTranslations("adminTraining");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        accept={accepts[kind]}
        aria-label={kind === "video" ? t("uploadVideo") : t("uploadResource")}
        className="max-w-xs"
        ref={fileRef}
        type="file"
      />
      <Button
        disabled={pending}
        onClick={() => {
          const file = fileRef.current?.files?.[0];
          if (!file) {
            setMessage({ error: true, text: t("chooseFile") });
            return;
          }
          startTransition(async () => {
            const prepared = await prepareTrainingMediaUploadAction(locale, lessonId, kind, file.name);
            if (prepared.status !== "ready") {
              setMessage({
                error: true,
                text: prepared.status === "error" ? prepared.message : t("uploadFailed"),
              });
              return;
            }
            const upload = await createBrowserSupabaseClient()
              .storage.from("training-media")
              .uploadToSignedUrl(prepared.path, prepared.token, file, {
                contentType: file.type,
                upsert: true,
              });
            if (upload.error) {
              setMessage({ error: true, text: t("uploadFailed") });
              return;
            }
            await finishTrainingMediaUploadAction(locale, lessonId);
            setMessage({ error: false, text: t("uploaded") });
            router.refresh();
          });
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {pending ? t("uploading") : kind === "video" ? t("uploadVideo") : t("uploadResource")}
      </Button>
      {message ? (
        <p
          className={message.error ? "text-sm text-destructive" : "text-sm text-emerald-700"}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
