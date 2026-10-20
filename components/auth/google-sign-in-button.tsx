"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { signInWithGoogleAction } from "@/lib/auth/actions";
import type { AppLocale } from "@/i18n/routing";

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 48 48">
      <path
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
        fill="#FFC107"
      />
      <path
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        fill="#FF3D00"
      />
      <path
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
        fill="#4CAF50"
      />
      <path
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
        fill="#1976D2"
      />
    </svg>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-busy={pending}
      className="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-input bg-white px-4 py-2.5 font-semibold text-[#1f1f1f] shadow-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      <GoogleMark />
      {label}
    </button>
  );
}

/** "Continue with Google" for both sign-in and sign-up. */
export function GoogleSignInButton({
  invitation,
  locale,
  next,
}: {
  invitation?: string;
  locale: AppLocale;
  next?: string;
}) {
  const t = useTranslations("authentication");
  return (
    <div className="space-y-4">
      <form action={signInWithGoogleAction.bind(null, locale)}>
        {next ? <input name="next" type="hidden" value={next} /> : null}
        {invitation ? <input name="invitation" type="hidden" value={invitation} /> : null}
        <SubmitButton label={t("continueWithGoogle")} />
      </form>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        {t("orUseEmail")}
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
