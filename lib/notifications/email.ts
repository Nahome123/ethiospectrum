import "server-only";
import { createTranslator } from "next-intl";
import { brandConfig } from "@/config/brand";
import { getSiteUrl } from "@/lib/auth/site-url";
import { getNotificationEmailEnv, type NotificationEmailEnv } from "@/lib/env/server";
import { formatCents } from "@/lib/services/constants";
import { fullDateTimeOptions } from "@/lib/services/display";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isKnownNotificationType, notificationValues, safeNotificationPath } from "./content";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type Locale = "en" | "am" | "es";
type Translate = (key: string, values?: Record<string, string>) => string;

const messageLoaders: Record<Locale, () => Promise<Record<string, unknown>>> = {
  en: async () => (await import("../../messages/en.json")).default,
  am: async () => (await import("../../messages/am.json")).default,
  es: async () => (await import("../../messages/es.json")).default,
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

export type RenderedEmail = { subject: string; text: string; html: string };

export async function renderNotificationEmail(input: {
  locale: string;
  firstName: string | null;
  type: string;
  payload: unknown;
  linkPath: string | null;
}): Promise<RenderedEmail | null> {
  if (!isKnownNotificationType(input.type)) return null;
  const locale: Locale = input.locale === "am" || input.locale === "es" ? input.locale : "en";
  const messages = await messageLoaders[locale]();
  // Keys are dynamic (per notification type), so the translators are used untyped.
  const t = createTranslator({ locale, messages: messages as never }) as unknown as Translate;
  const n = (key: string, values?: Record<string, string>) => t(`notifications.${key}`, values);
  const services = (type: string) => t(`services.types.${type}`);
  const intlLocale = locale === "am" ? "am-ET" : locale === "es" ? "es-US" : "en-US";
  const values = notificationValues(input.payload, {
    serviceName: (type) =>
      ["rbt_bootcamp", "consultation", "iep_language_assistance"].includes(type) ? services(type) : "",
    formatDate: (iso) =>
      new Intl.DateTimeFormat(intlLocale, { ...fullDateTimeOptions, timeZone: "UTC" }).format(new Date(iso)),
    formatAmount: (cents) => formatCents(cents, locale),
  });
  const subject = n(`types.${input.type}.title`, values);
  const body = n(`types.${input.type}.body`, values);
  const path = safeNotificationPath(input.linkPath);
  const url = path ? `${getSiteUrl()}/${locale}${path}` : `${getSiteUrl()}/${locale}/dashboard`;
  const greeting = n("email.greeting", { name: input.firstName ?? "" }).trim();
  const footer = n("email.footer", { brand: brandConfig.name });
  const action = n("email.action");
  return {
    subject: `${brandConfig.name}: ${subject}`,
    text: `${greeting}\n\n${body}\n\n${action}: ${url}\n\n${footer}`,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p><p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
  };
}

async function sendWithResend(env: NotificationEmailEnv, to: string, email: RenderedEmail): Promise<boolean> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.from,
      to: [to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  return response.ok;
}

/**
 * Delivers a bounded batch of queued notification emails. Without an email
 * provider, queued rows are marked `skipped` and remain visible in-app.
 */
export async function deliverNotificationEmails(admin: AdminClient, limit = 25) {
  const env = getNotificationEmailEnv();
  const claimed = await admin.rpc("claim_notification_emails", { batch_size: limit });
  if (claimed.error || !claimed.data) throw new Error("notification_claim_failed");
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of claimed.data) {
    let outcome: "sent" | "skipped" | "failed" = "skipped";
    let code: string | undefined = env ? undefined : "email_not_configured";
    try {
      const email = row.recipient_email
        ? await renderNotificationEmail({
            locale: row.recipient_locale,
            firstName: row.recipient_first_name,
            type: row.notification_type,
            payload: row.payload,
            linkPath: row.link_path,
          })
        : null;
      if (!email) code = "unrenderable";
      else if (env && row.recipient_email) {
        outcome = (await sendWithResend(env, row.recipient_email, email)) ? "sent" : "failed";
        code = outcome === "failed" ? "provider_rejected" : undefined;
      }
    } catch {
      outcome = "failed";
      code = "delivery_error";
    }
    await admin.rpc("complete_notification_email", {
      target_notification_id: row.id,
      input_outcome: outcome,
      input_error_code: code,
    });
    if (outcome === "sent") sent += 1;
    else if (outcome === "failed") failed += 1;
    else skipped += 1;
  }
  return { claimed: claimed.data.length, sent, skipped, failed };
}
