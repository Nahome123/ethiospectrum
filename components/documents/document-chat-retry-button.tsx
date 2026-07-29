"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { retryDocumentChatResponseAction } from "@/lib/documents/chat-actions";
import { initialDocumentChatActionState } from "@/lib/documents/chat-action-state";

export function DocumentChatRetryButton({
  documentId,
  conversationId,
  locale,
  messageId,
}: {
  documentId: string;
  conversationId: string;
  locale: AppLocale;
  messageId: string;
}) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [state, action, pending] = useActionState(
    retryDocumentChatResponseAction.bind(null, locale, documentId, conversationId, messageId),
    initialDocumentChatActionState,
  );
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        {t("retryResponse")}
      </Button>
      {state.status !== "idle" ? (
        <p
          className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
