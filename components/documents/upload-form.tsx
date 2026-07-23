"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/i18n/routing";
import {
  completeDocumentUploadAction,
  markDocumentUploadFailedAction,
  prepareDocumentUploadAction,
} from "@/lib/documents/actions";
import { initialDocumentActionState } from "@/lib/documents/action-state";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { createDocumentFormSchema, validateDocumentFile } from "@/lib/validation/document";

type Values = {
  title: string;
  dependentId: string;
  documentType: string;
};

type DependentOption = { id: string; first_name: string; preferred_name: string | null };

export function UploadDocumentForm({
  locale,
  dependents,
}: {
  locale: AppLocale;
  dependents: DependentOption[];
}) {
  const t = useTranslations("documents");
  const router = useRouter();
  const handledUpload = useRef<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "preparing" | "uploading" | "completing">("idle");
  const stageRef = useRef(stage);
  const [, startTransition] = useTransition();
  const validationMessages = {
    title: t("titleError"),
    text: t("textError"),
    category: t("categoryError"),
    dependent: t("dependentError"),
    filename: t("filenameError"),
    unsupportedFile: t("unsupportedFile"),
    fileTooLarge: t("fileTooLarge"),
    emptyFile: t("emptyFile"),
  };
  const form = useForm<Values>({
    defaultValues: { title: "", dependentId: "", documentType: "" },
    resolver: zodResolver(createDocumentFormSchema(validationMessages), undefined, { raw: true }),
  });
  const [prepareState, prepareAction, preparing] = useActionState(
    prepareDocumentUploadAction.bind(null, locale),
    initialDocumentActionState,
  );
  const busy = preparing || stage !== "idle";
  const actionError = prepareState.status === "error" ? prepareState.message : null;

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    if (stageRef.current !== "preparing" || preparing) return;
    if (prepareState.status === "error") {
      const resetPreparation = window.setTimeout(() => setStage("idle"), 0);
      return () => window.clearTimeout(resetPreparation);
    }
    if (prepareState.status !== "ready" || handledUpload.current === prepareState.documentId) return;
    handledUpload.current = prepareState.documentId;
    let cancelled = false;
    if (!selectedFile) {
      const failMissingFile = async () => {
        await markDocumentUploadFailedAction(locale, prepareState.documentId);
        if (!cancelled) {
          setStage("idle");
          setUploadError(t("uploadFailed"));
        }
      };
      void failMissingFile();
      return () => {
        cancelled = true;
      };
    }

    const upload = async () => {
      setStage("uploading");
      setUploadError(null);
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.storage
        .from("family-documents")
        .uploadToSignedUrl(prepareState.storagePath, prepareState.uploadToken, selectedFile, {
          contentType: selectedFile.type,
        });
      if (cancelled) return;
      if (error) {
        await markDocumentUploadFailedAction(locale, prepareState.documentId);
        if (!cancelled) {
          setStage("idle");
          setUploadError(t("uploadFailed"));
        }
        return;
      }

      setStage("completing");
      const completed = await completeDocumentUploadAction(locale, prepareState.documentId);
      if (cancelled) return;
      if (completed.status !== "complete") {
        setStage("idle");
        setUploadError(completed.status === "error" ? completed.message : t("uploadFailed"));
        return;
      }
      router.push(`/${locale}/documents/${completed.documentId}`);
      router.refresh();
    };
    void upload();
    return () => {
      cancelled = true;
    };
  }, [locale, prepareState, preparing, router, selectedFile, t]);

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        setUploadError(null);
        if (!selectedFile) {
          setFileError(t("chooseFileError"));
          return;
        }
        const fileResult = validateDocumentFile(selectedFile, validationMessages);
        if (!fileResult.success) {
          setFileError(fileResult.message);
          return;
        }
        setFileError(null);
        const data = new FormData();
        data.set("title", values.title);
        data.set("dependentId", values.dependentId);
        data.set("documentType", values.documentType);
        data.set("originalFilename", selectedFile.name);
        data.set("mimeType", selectedFile.type);
        data.set("fileSize", String(selectedFile.size));
        setStage("preparing");
        startTransition(() => prepareAction(data));
      })}
    >
      <div className="space-y-1.5">
        <Label htmlFor="document-title">{t("documentTitle")}</Label>
        <Input
          aria-describedby={form.formState.errors.title ? "document-title-error" : undefined}
          aria-invalid={Boolean(form.formState.errors.title)}
          id="document-title"
          maxLength={160}
          {...form.register("title")}
        />
        {form.formState.errors.title?.message ? (
          <p className="text-sm text-destructive" id="document-title-error" role="alert">
            {form.formState.errors.title.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="document-dependent">{t("assignedDependent")}</Label>
        <select
          aria-describedby={form.formState.errors.dependentId ? "document-dependent-error" : undefined}
          aria-invalid={Boolean(form.formState.errors.dependentId)}
          className="flex h-9 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          id="document-dependent"
          {...form.register("dependentId")}
        >
          <option value="">{t("householdLevel")}</option>
          {dependents.map((dependent) => (
            <option key={dependent.id} value={dependent.id}>
              {dependent.preferred_name || dependent.first_name}
            </option>
          ))}
        </select>
        {form.formState.errors.dependentId?.message ? (
          <p className="text-sm text-destructive" id="document-dependent-error" role="alert">
            {form.formState.errors.dependentId.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="document-category">{t("documentCategory")}</Label>
        <select
          aria-describedby={form.formState.errors.documentType ? "document-category-error" : undefined}
          aria-invalid={Boolean(form.formState.errors.documentType)}
          className="flex h-9 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          id="document-category"
          {...form.register("documentType")}
        >
          <option value="">{t("noCategory")}</option>
          <option value="education">{t("categoryEducation")}</option>
          <option value="health">{t("categoryHealth")}</option>
          <option value="legal">{t("categoryLegal")}</option>
          <option value="other">{t("categoryOther")}</option>
        </select>
        {form.formState.errors.documentType?.message ? (
          <p className="text-sm text-destructive" id="document-category-error" role="alert">
            {form.formState.errors.documentType.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="document-file">{t("chooseFile")}</Label>
        <p className="text-sm text-muted-foreground" id="document-file-help">
          {t("fileRequirements", { size: "20 MB" })}
        </p>
        <Input
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.pdf,.docx,.txt"
          aria-describedby={fileError ? "document-file-help document-file-error" : "document-file-help"}
          aria-invalid={Boolean(fileError)}
          disabled={busy}
          id="document-file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            setSelectedFile(file);
            setFileError(null);
          }}
          type="file"
        />
        {fileError ? (
          <p className="text-sm text-destructive" id="document-file-error" role="alert">
            {fileError}
          </p>
        ) : null}
      </div>
      {actionError || uploadError ? (
        <p className="text-sm text-destructive" role="alert">
          {uploadError ?? actionError}
        </p>
      ) : null}
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {stage === "preparing" || stage === "uploading"
          ? t("uploading")
          : stage === "completing"
            ? t("verifyingUpload")
            : null}
      </p>
      <Button disabled={busy} type="submit">
        {preparing || stage === "preparing" || stage === "uploading" || stage === "completing"
          ? t("uploading")
          : t("uploadDocument")}
      </Button>
    </form>
  );
}
