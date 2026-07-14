"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { signInAction, signUpAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";
import {
  createLoginSchema,
  createSignupSchema,
  type LoginInput,
  type SignupInput,
} from "@/lib/validation/auth";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({
  mode,
  locale,
  next,
}: {
  mode: "login" | "signup";
  locale: AppLocale;
  next?: string;
}) {
  const t = useTranslations("authentication");
  const signup = mode === "signup";
  const schema = signup
    ? createSignupSchema({
        email: t("emailError"),
        password: t("passwordError"),
        name: t("nameError"),
        passwordMatch: t("passwordMismatch"),
        terms: t("termsRequired"),
      })
    : createLoginSchema({ email: t("emailError"), password: t("passwordError") });
  const form = useForm<LoginInput | SignupInput>({
    resolver: zodResolver(schema),
    defaultValues: signup
      ? { firstName: "", lastName: "", email: "", password: "", confirmPassword: "", termsAccepted: false }
      : { email: "", password: "" },
  });
  const [state, action] = useActionState(
    signup ? signUpAction.bind(null, locale) : signInAction.bind(null, locale),
    initialAuthActionState,
  );
  const [isTransitioning, startTransition] = useTransition();

  function submit(values: LoginInput | SignupInput) {
    const data = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value === true) data.set(key, "on");
      if (typeof value === "string") data.set(key, value);
    });
    if (next) data.set("next", next);
    startTransition(() => action(data));
  }

  const pending = isTransitioning;
  const errors = form.formState.errors;
  const signupErrors = errors as {
    firstName?: { message?: string };
    lastName?: { message?: string };
    confirmPassword?: { message?: string };
    termsAccepted?: { message?: string };
  };

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-4">
      {signup && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("firstName")} error={signupErrors.firstName?.message}>
            <Input id="firstName" autoComplete="given-name" {...form.register("firstName")} />
          </Field>
          <Field label={t("lastName")} error={signupErrors.lastName?.message}>
            <Input id="lastName" autoComplete="family-name" {...form.register("lastName")} />
          </Field>
        </div>
      )}
      <Field label={t("email")} error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label={t("password")} error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          {...form.register("password")}
        />
      </Field>
      {signup && (
        <>
          <Field label={t("confirmPassword")} error={signupErrors.confirmPassword?.message}>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
          </Field>
          <div className="space-y-1.5">
            <Label htmlFor="termsAccepted">
              <input
                id="termsAccepted"
                type="checkbox"
                className="size-4 accent-primary"
                {...form.register("termsAccepted")}
              />
              {t("termsAcknowledgement")}
            </Label>
            {signupErrors.termsAccepted?.message && (
              <p role="alert" className="text-sm text-destructive">
                {signupErrors.termsAccepted?.message}
              </p>
            )}
          </div>
        </>
      )}
      {state.status === "error" && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}
      <Button className="min-h-11 w-full" size="lg" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? t("pending") : t(signup ? "submitSignup" : "submitLogin")}
      </Button>
      {!signup && (
        <p className="text-center text-sm">
          <Link className="font-semibold text-primary underline" href="/forgot-password">
            {t("forgotPassword")}
          </Link>
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {t(signup ? "haveAccount" : "needAccount")}{" "}
        <Link className="font-semibold text-primary underline" href={signup ? "/login" : "/signup"}>
          {t(signup ? "submitLogin" : "submitSignup")}
        </Link>
      </p>
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
