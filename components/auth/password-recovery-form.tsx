"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { forgotPasswordAction, resendConfirmationAction, resetPasswordAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";
import {
  createForgotPasswordSchema,
  createResetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/lib/validation/auth";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

export function PasswordRecoveryForm({
  mode,
  locale,
}: {
  mode: "forgot" | "resend" | "reset";
  locale: AppLocale;
}) {
  const t = useTranslations("authentication");
  const reset = mode === "reset";
  const resend = mode === "resend";
  const schema = reset
    ? createResetPasswordSchema({ password: t("passwordError"), passwordMatch: t("passwordMismatch") })
    : createForgotPasswordSchema({ email: t("emailError") });
  const form = useForm<ForgotPasswordInput | ResetPasswordInput>({
    resolver: zodResolver(schema),
    defaultValues: reset ? { password: "", confirmPassword: "" } : { email: "" },
  });
  const [state, action] = useActionState(
    reset
      ? resetPasswordAction.bind(null, locale)
      : resend
        ? resendConfirmationAction.bind(null, locale)
        : forgotPasswordAction.bind(null, locale),
    initialAuthActionState,
  );
  const [isTransitioning, startTransition] = useTransition();

  function submit(values: ForgotPasswordInput | ResetPasswordInput) {
    const data = new FormData();
    Object.entries(values).forEach(([key, value]) => data.set(key, value));
    startTransition(() => action(data));
  }

  const errors = form.formState.errors as {
    email?: { message?: string };
    password?: { message?: string };
    confirmPassword?: { message?: string };
  };
  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-4">
      {!reset && (
        <Field label={t("email")} error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
        </Field>
      )}
      {reset && (
        <>
          <Field label={t("newPassword")} error={errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field label={t("confirmPassword")} error={errors.confirmPassword?.message}>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
          </Field>
        </>
      )}
      {state.status !== "idle" && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className="rounded-md border border-border bg-secondary px-3 py-2 text-sm"
        >
          {state.message}
        </p>
      )}
      <Button
        className="min-h-11 w-full"
        size="lg"
        type="submit"
        disabled={isTransitioning}
        aria-disabled={isTransitioning}
      >
        {isTransitioning
          ? t("pending")
          : t(reset ? "submitResetPassword" : resend ? "submitResendConfirmation" : "submitForgotPassword")}
      </Button>
      {reset && state.status === "success" && (
        <Link href="/login" className="block text-center text-sm font-semibold text-primary underline">
          {t("backToLogin")}
        </Link>
      )}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  const id = (children as React.ReactElement<{ id: string }>).props.id;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
