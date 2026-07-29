"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { sendDocumentChatMessageAction } from "@/lib/documents/chat-actions";
import { initialDocumentChatActionState } from "@/lib/documents/chat-action-state";

/** Client code submits only a bounded message and idempotency key. */
export function DocumentChatComposer({
  documentId,
  conversationId,
  locale,
}: {
  documentId: string;
  conversationId: string;
  locale: AppLocale;
}) {
  const t = useTranslations("chat");
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const idempotencyKeyInput = useRef<HTMLInputElement>(null);
  const [initialIdempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    sendDocumentChatMessageAction.bind(null, locale, documentId, conversationId),
    initialDocumentChatActionState,
  );
  useEffect(() => {
    if (state.status === "success") {
      form.current?.reset();
      if (idempotencyKeyInput.current) idempotencyKeyInput.current.value = crypto.randomUUID();
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={action} aria-busy={pending} className="mt-5 grid gap-3" ref={form}>
      <div className="grid gap-1">
        <label className="text-sm font-semibold" htmlFor="document-chat-message">
          {t("askAboutDocument")}
        </label>
        <textarea
          className="min-h-28 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
          disabled={pending}
          id="document-chat-message"
          maxLength={700}
          name="message"
          required
        />
        <p className="text-sm text-muted-foreground">{t("messageLimit")}</p>
      </div>
      <input
        defaultValue={initialIdempotencyKey}
        name="idempotencyKey"
        ref={idempotencyKeyInput}
        type="hidden"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} type="submit">
          {pending ? t("sendingMessage") : t("sendMessage")}
        </Button>
        {state.status !== "idle" ? (
          <p
            className={
              state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
            }
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
