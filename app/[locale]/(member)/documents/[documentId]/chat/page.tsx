import { getTranslations } from "next-intl/server";
import { DocumentChatStartForm } from "@/components/documents/document-chat-start-form";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  getDocumentChatConversations,
  getDocumentChatEligibility,
  getVisibleDocument,
} from "@/lib/documents/server";
import { documentIdSchema } from "@/lib/validation/document";

function languageLabel(language: "en" | "am" | "es", t: Awaited<ReturnType<typeof getTranslations>>): string {
  if (language === "am") return t("amharic");
  if (language === "es") return t("spanish");
  return t("english");
}

export default async function DocumentChatIndexPage({
  params,
}: {
  params: Promise<{ locale: string; documentId: string }>;
}) {
  const { locale: localeParam, documentId } = await params;
  const locale = localeParam as AppLocale;
  const [documentT, chatT] = await Promise.all([
    getTranslations({ locale, namespace: "documents" }),
    getTranslations({ locale, namespace: "chat" }),
  ]);
  if (!documentIdSchema.safeParse(documentId).success) return <p>{documentT("notFound")}</p>;
  const record = await getVisibleDocument(documentId);
  if (!record) return <p>{documentT("notFound")}</p>;
  const [eligibility, conversations] = await Promise.all([
    getDocumentChatEligibility(record.document),
    getDocumentChatConversations(documentId),
  ]);

  return (
    <section className="max-w-3xl">
      <Link
        className="text-sm font-semibold text-primary underline underline-offset-4"
        href={`/documents/${documentId}`}
      >
        {chatT("backToDocument")}
      </Link>
      <div className="mt-4">
        <h1 className="break-words text-3xl font-bold">{chatT("documentChat")}</h1>
        <p className="mt-2 break-words text-muted-foreground">{record.document.title}</p>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{chatT("description")}</p>
      </div>

      {!eligibility.available ? (
        <p className="mt-6 rounded-xl border bg-card p-4 text-sm text-muted-foreground" role="status">
          {eligibility.reason === "ocr"
            ? documentT("ocrRequired")
            : eligibility.reason === "unavailable"
              ? chatT("unavailable")
              : documentT("processingRequired")}
        </p>
      ) : (
        <>
          <section aria-labelledby="document-chat-conversations" className="mt-8">
            <h2 className="text-xl font-bold" id="document-chat-conversations">
              {chatT("conversations")}
            </h2>
            {conversations.length ? (
              <ol aria-label={chatT("conversationListLabel")} className="mt-4 space-y-3">
                {conversations.map((conversation) => (
                  <li className="rounded-xl border bg-card p-4" key={conversation.id}>
                    <Link
                      className="block min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      href={`/documents/${documentId}/chat/${conversation.id}`}
                    >
                      <p className="break-words font-semibold">{conversation.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {languageLabel(conversation.language, chatT)} · {conversation.messageCount}
                      </p>
                      {conversation.hasPendingResponse ? (
                        <p className="mt-2 text-sm text-muted-foreground">{chatT("generatingResponse")}</p>
                      ) : null}
                      {conversation.hasFailedResponse ? (
                        <p className="mt-2 text-sm text-destructive">{chatT("responseFailed")}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                {chatT("noConversations")}
              </p>
            )}
          </section>
          {record.context.canProcess ? (
            <DocumentChatStartForm documentId={documentId} locale={locale} />
          ) : (
            <p className="mt-6 rounded-xl border bg-card p-4 text-sm text-muted-foreground" role="status">
              {chatT("readOnly")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
