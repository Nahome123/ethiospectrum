"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, type FieldErrors } from "react-hook-form";
import {
  createLoginSchema,
  createSignupSchema,
  type LoginInput,
  type SignupInput,
} from "@/lib/validation/auth";
import { Link } from "@/i18n/navigation";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const t = useTranslations("authentication");
  const schema =
    mode === "login"
      ? createLoginSchema({ email: t("emailError"), password: t("passwordError") })
      : createSignupSchema({ email: t("emailError"), password: t("passwordError"), name: t("nameError") });
  const form = useForm<LoginInput | SignupInput>({
    resolver: zodResolver(schema),
    defaultValues:
      mode === "login"
        ? { email: "", password: "" }
        : { firstName: "", lastName: "", email: "", password: "" },
  });
  const onSubmit = () => form.setError("root", { message: t("notReady") });
  const signup = mode === "signup";
  const signupErrors = form.formState.errors as FieldErrors<SignupInput>;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {signup && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(["firstName", "lastName"] as const).map((field) => (
            <Field
              key={field}
              label={t(field)}
              error={signupErrors[field]?.message}
              input={
                <input
                  id={field}
                  autoComplete={field === "firstName" ? "given-name" : "family-name"}
                  {...form.register(field)}
                />
              }
            />
          ))}
        </div>
      )}
      <Field
        label={t("email")}
        error={form.formState.errors.email?.message}
        input={<input id="email" type="email" autoComplete="email" {...form.register("email")} />}
      />
      <Field
        label={t("password")}
        error={form.formState.errors.password?.message}
        input={
          <input
            id="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            {...form.register("password")}
          />
        }
      />
      {form.formState.errors.root?.message && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-red-50 px-3 py-2 text-sm text-destructive"
        >
          {form.formState.errors.root.message}
        </p>
      )}
      <button
        className="min-h-11 w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        type="submit"
      >
        {t(signup ? "submitSignup" : "submitLogin")}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        {t(signup ? "haveAccount" : "needAccount")}{" "}
        <Link className="font-semibold text-primary underline" href={signup ? "/login" : "/signup"}>
          {t(signup ? "submitLogin" : "submitSignup")}
        </Link>
      </p>
    </form>
  );
}

function Field({ label, error, input }: { label: string; error?: string; input: React.ReactNode }) {
  const id = (input as React.ReactElement<{ id: string }>).props.id;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-slate-800" htmlFor={id}>
        {label}
      </label>
      {input && (
        <div className="[&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-input [&_input]:bg-white [&_input]:px-3 [&_input]:text-slate-900 [&_input]:focus-visible:outline-2 [&_input]:focus-visible:outline-offset-2 [&_input]:focus-visible:outline-ring">
          {input}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
