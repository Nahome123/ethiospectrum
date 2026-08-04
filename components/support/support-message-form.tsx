"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addSupportRequestMessageAction } from "@/lib/support/actions";
import { initialSupportActionState } from "@/lib/support/action-state";
import { SUPPORT_MESSAGE_MAX } from "@/lib/support/constants";

export function SupportMessageForm({ locale, requestId }: { locale: AppLocale; requestId: string }) {
  const t = useTranslations("support");
  const formElement = useRef<HTMLFormElement>(null);
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(
    addSupportRequestMessageAction.bind(null, locale, requestId),
    initialSupportActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      formElement.current?.reset();
      if (idempotencyInput.current) idempotencyInput.current.value = "";
    }
  }, [state]);

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={() => {
        if (idempotencyInput.current && !idempotencyInput.current.value) {
          idempotencyInput.current.value = crypto.randomUUID();
        }
      }}
      ref={formElement}
    >
      <input name="idempotencyKey" ref={idempotencyInput} type="hidden" />
      <div className="space-y-1.5">
        <Label htmlFor="support-follow-up">{t("followUp")}</Label>
        <Textarea id="support-follow-up" maxLength={SUPPORT_MESSAGE_MAX} name="body" required rows={4} />
        <p className="text-sm text-muted-foreground">{t("followUpHelp")}</p>
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm font-semibold text-primary" role="status">
          {state.message}
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {pending ? t("sending") : ""}
      </p>
      <Button disabled={pending} type="submit">
        {pending ? t("sending") : t("addFollowUp")}
      </Button>
    </form>
  );
}
