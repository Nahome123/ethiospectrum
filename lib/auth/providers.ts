import "server-only";

/**
 * "Continue with Google" is shown only once the Google provider is enabled in
 * Supabase (Authentication -> Sign In / Providers -> Google). Until then the
 * button would lead to a Supabase error page, so it stays hidden.
 */
export function isGoogleSignInEnabled(): boolean {
  return process.env.AUTH_GOOGLE_ENABLED === "true";
}
