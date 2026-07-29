"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { createDocumentChatConversationAction } from "@/lib/documents/chat-actions";
import { initialDocumentChatActionState } from "@/lib/documents/chat-action-state";

/** Starts a conversation without sending any trusted identity or source fields from the browser. */
export function DocumentChatStartForm({ documentId, locale }: { documentId: string; locale: AppLocale }) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    createDocumentChatConversationAction.bind(null, locale, documentId),
    initialDocumentChatActionState,
  );
  useEffect(() => {
    if (state.status === "success" && state.conversationId) {
      router.push(`/documents/${documentId}/chat/${state.conversationId}`);
    }
  }, [documentId, router, state]);

  return (
    <form action={action} aria-busy={pending} className="mt-4 grid gap-4 rounded-xl border bg-background p-4">
      <h2 className="font-semibold">{t("newConversation")}</h2>
      <div className="grid gap-1">
        <label className="text-sm font-semibold" htmlFor="document-chat-language">
          {t("conversationLanguage")}
        </label>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          defaultValue={locale}
          disabled={pending}
          id="document-chat-language"
          name="language"
        >
          <option value="en">{t("english")}</option>
          <option value="am">{t("amharic")}</option>
          <option value="es">{t("spanish")}</option>
        </select>
      </div>
      <div className="grid gap-1">
        <label className="text-sm font-semibold" htmlFor="document-chat-first-message">
          {t("askAboutDocument")}
        </label>
        <textarea
          className="min-h-28 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
          disabled={pending}
          id="document-chat-first-message"
          maxLength={700}
          name="message"
          required
        />
        <p className="text-sm text-muted-foreground">{t("messageLimit")}</p>
      </div>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} type="submit">
          {pending ? t("sendingMessage") : t("startConversation")}
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
