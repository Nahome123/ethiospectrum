"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/i18n/routing";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import {
  completeRequestDocumentUploadAction,
  prepareRequestDocumentUploadAction,
} from "@/lib/services/document-actions";
import { initialRequestDocumentActionState } from "@/lib/services/action-state";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { validateDocumentFile } from "@/lib/validation/document";

/**
 * Private upload linked to one service request. The server prepares the row
 * and a signed upload token; the file goes straight to private Storage and the
 * server verifies the stored object before marking it uploaded.
 */
export function RequestDocumentUpload({ locale, requestId }: { locale: AppLocale; requestId: string }) {
  const t = useTranslations("documents");
  const s = useTranslations("services.documents");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage({ kind: "error", text: s("fileRequired") });
      return;
    }
    const check = validateDocumentFile(file, {
      unsupportedFile: t("unsupportedFile"),
      fileTooLarge: t("fileTooLarge"),
      emptyFile: t("emptyFile"),
    });
    if (!check.success) {
      setMessage({ kind: "error", text: check.message });
      return;
    }
    startTransition(async () => {
      setMessage(null);
      const data = new FormData();
      data.set("title", title.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 160));
      data.set("documentType", "education");
      data.set("originalFilename", file.name);
      data.set("mimeType", file.type);
      data.set("fileSize", String(file.size));
      const prepared = await prepareRequestDocumentUploadAction(
        locale,
        requestId,
        initialRequestDocumentActionState,
        data,
      );
      if (prepared.status !== "ready") {
        setMessage({
          kind: "error",
          text: prepared.status === "error" ? prepared.message : t("uploadFailed"),
        });
        return;
      }
      const upload = await createBrowserSupabaseClient()
        .storage.from(DOCUMENT_BUCKET)
        .uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, file, { contentType: file.type });
      if (upload.error) {
        setMessage({ kind: "error", text: t("uploadFailed") });
        return;
      }
      const completed = await completeRequestDocumentUploadAction(locale, requestId, prepared.documentId);
      if (completed.status !== "complete") {
        setMessage({
          kind: "error",
          text: completed.status === "error" ? completed.message : t("uploadFailed"),
        });
        return;
      }
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      setMessage({ kind: "success", text: s("uploaded") });
      router.refresh();
    });
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`request-doc-title-${requestId}`}>{s("title")}</Label>
          <Input
            id={`request-doc-title-${requestId}`}
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={s("titlePlaceholder")}
            value={title}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`request-doc-file-${requestId}`}>{s("file")}</Label>
          <Input
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.pdf,.docx,.txt"
            id={`request-doc-file-${requestId}`}
            ref={fileRef}
            type="file"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{s("privacy")}</p>
      <Button disabled={pending} size="sm" type="submit">
        {pending ? s("uploading") : s("upload")}
      </Button>
      {message ? (
        <p
          className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-700"}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
