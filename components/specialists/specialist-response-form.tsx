"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addSpecialistSupportMessageAction } from "@/lib/specialists/actions";
import { initialSpecialistActionState } from "@/lib/specialists/action-state";
import { SPECIALIST_MESSAGE_MAX } from "@/lib/specialists/constants";

export function SpecialistResponseForm({ locale, requestId }: { locale: AppLocale; requestId: string }) {
  const t = useTranslations("specialists");
  const formElement = useRef<HTMLFormElement>(null);
  const idempotencyInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(
    addSpecialistSupportMessageAction.bind(null, locale, requestId),
    initialSpecialistActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      formElement.current?.reset();
      // A fresh key is generated on the next submit so a retry stays idempotent.
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
        <Label htmlFor="specialist-response">{t("specialistResponse")}</Label>
        <Textarea id="specialist-response" maxLength={SPECIALIST_MESSAGE_MAX} name="body" required rows={4} />
        <p className="text-sm text-muted-foreground">{t("responseHelp")}</p>
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
        {pending ? t("sending") : t("addResponse")}
      </Button>
    </form>
  );
}
