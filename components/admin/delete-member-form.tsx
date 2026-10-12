"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DeleteMemberState } from "@/lib/admin/member-actions";

type DeleteMemberServerAction = (state: DeleteMemberState, formData: FormData) => Promise<DeleteMemberState>;

/** The final step: type the member's email, optionally give a reason, then delete. */
export function DeleteMemberForm({ action, email }: { action: DeleteMemberServerAction; email: string }) {
  const t = useTranslations("adminConsole.deleteMember");
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as DeleteMemberState);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === email;

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="confirm-email">{t("typeEmail", { email })}</Label>
        <Input
          autoComplete="off"
          id="confirm-email"
          name="confirmEmail"
          onChange={(event) => setTyped(event.target.value)}
          spellCheck={false}
          value={typed}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="delete-reason">{t("reason")}</Label>
        <Textarea
          id="delete-reason"
          maxLength={500}
          name="reason"
          placeholder={t("reasonPlaceholder")}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">{t("reasonHelp")}</p>
      </div>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button
        className="bg-destructive text-white hover:bg-destructive/90"
        disabled={!matches || pending}
        size="lg"
        type="submit"
      >
        {pending ? t("deleting") : t("submit")}
      </Button>
    </form>
  );
}
