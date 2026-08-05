import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import type { SupportRequestMessage } from "@/lib/support/server";

function formatDateTime(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/**
 * Author kind is rendered as text, never colour alone, so a specialist response
 * is distinguishable without relying on styling.
 */
export async function SupportMessageList({
  locale,
  messages,
  showSelfAttribution = true,
}: {
  locale: AppLocale;
  messages: SupportRequestMessage[];
  showSelfAttribution?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "support" });
  const specialistTranslations = await getTranslations({ locale, namespace: "specialists" });

  if (messages.length === 0) {
    return <p className="mt-3 text-muted-foreground">{t("noMessages")}</p>;
  }

  return (
    <ol className="mt-3 grid gap-3">
      {messages.map((message) => {
        const isSpecialist = message.author_kind === "specialist";
        return (
          <li
            className={`rounded-xl border bg-white p-4 ${
              isSpecialist ? "border-primary/40 bg-primary/5" : "border-border"
            }`}
            key={message.id}
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {showSelfAttribution && message.author_is_self ? t("you") : message.author_name}
              </span>
              <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                {isSpecialist
                  ? specialistTranslations("specialistResponseLabel")
                  : specialistTranslations("caregiverMessageLabel")}
              </span>
              {message.author_is_former ? <span>({t("formerMember")})</span> : null}
              <span>{formatDateTime(message.created_at, locale)}</span>
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">
              {message.body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
