import { getTranslations } from "next-intl/server";
import { DocumentChatAutoScroll } from "@/components/documents/document-chat-auto-scroll";
import { DocumentChatComposer } from "@/components/documents/document-chat-composer";
import { DocumentChatRetryButton } from "@/components/documents/document-chat-retry-button";
import { CitationList } from "@/components/documents/citation-list";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  getDocumentChatConversationDetails,
  getDocumentChatEligibility,
  getDocumentSummaryDetails,
  getDocumentSummaryQualityDetails,
  getVisibleDocument,
} from "@/lib/documents/server";
import { documentIdSchema } from "@/lib/validation/document";

function languageLabel(language: "en" | "am" | "es", t: Awaited<ReturnType<typeof getTranslations>>): string {
  if (language === "am") return t("amharic");
  if (language === "es") return t("spanish");
  return t("english");
}

export default async function DocumentChatConversationPage({
  params,
}: {
  params: Promise<{ locale: string; documentId: string; conversationId: string }>;
}) {
  const { locale: localeParam, documentId, conversationId } = await params;
  const locale = localeParam as AppLocale;
  const [documentT, chatT] = await Promise.all([
    getTranslations({ locale, namespace: "documents" }),
    getTranslations({ locale, namespace: "chat" }),
  ]);
  if (
    !documentIdSchema.safeParse(documentId).success ||
    !documentIdSchema.safeParse(conversationId).success
  ) {
    return <p>{documentT("notFound")}</p>;
  }
  const record = await getVisibleDocument(documentId);
  if (!record) return <p>{documentT("notFound")}</p>;
  const [eligibility, conversation] = await Promise.all([
    getDocumentChatEligibility(record.document),
    getDocumentChatConversationDetails(documentId, conversationId, record.document.mime_type),
  ]);
  if (!eligibility.available || !conversation) return <p>{documentT("notFound")}</p>;
  const [summary, quality] = await Promise.all([
    getDocumentSummaryDetails(documentId, conversation.language, record.document.mime_type),
    getDocumentSummaryQualityDetails(documentId, conversation.language, record.context.userId),
  ]);
  const hasPendingResponse = conversation.messages.some(
    (message) =>
      message.role === "assistant" && (message.status === "pending" || message.status === "generating"),
  );
  const summaryWarnings = [
    quality.evaluation?.status === "failed" ? chatT("summaryEvaluationFailed") : null,
    quality.reviewStatus === "rejected" ? chatT("summaryRejected") : null,
    quality.reviewStatus === "needs_revision" ? chatT("summaryNeedsRevision") : null,
    summary?.sourceCoverage === "partial" ? chatT("summaryQualityWarning") : null,
  ].filter((warning): warning is string => Boolean(warning));

  return (
    <section className="max-w-3xl">
      <DocumentStatusRefresher active={hasPendingResponse} />
      <Link
        className="text-sm font-semibold text-primary underline underline-offset-4"
        href={`/documents/${documentId}/chat`}
      >
        {chatT("conversations")}
      </Link>
      <h1 className="mt-4 break-words text-3xl font-bold">{chatT("documentChat")}</h1>
      <p className="mt-2 break-words text-muted-foreground">{record.document.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {chatT("conversationLanguage")}: {languageLabel(conversation.language, chatT)}
      </p>
      {summaryWarnings.length ? (
        <aside className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {summaryWarnings.map((warning) => (
            <p className="break-words" key={warning}>
              {warning}
            </p>
          ))}
        </aside>
      ) : null}
      {summary?.sourceCoverage === "partial" ? (
        <p className="mt-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {chatT("onlyProcessedContent")}
        </p>
      ) : null}

      <ol aria-label={chatT("messageHistory")} className="mt-6 space-y-4" role="log">
        {conversation.messages.map((message, index) => (
          <li
            className={
              message.role === "user"
                ? "ml-auto max-w-[90%] rounded-2xl bg-primary p-4 text-primary-foreground"
                : "mr-auto max-w-[90%] rounded-2xl border bg-card p-4"
            }
            key={message.id}
          >
            {message.status === "pending" || message.status === "generating" ? (
              <p className="text-sm" role="status">
                {chatT("generatingResponse")}
              </p>
            ) : null}
            {message.status === "failed" ? (
              <div>
                <p className="text-sm text-destructive" role="status">
                  {chatT("responseFailed")}
                </p>
                {record.context.canProcess && message.retryable ? (
                  <DocumentChatRetryButton
                    conversationId={conversationId}
                    documentId={documentId}
                    locale={locale}
                    messageId={message.id}
                  />
                ) : null}
              </div>
            ) : null}
            {message.status === "completed" && message.content ? (
              <div>
                {message.role === "assistant" && message.resultType === "insufficient_evidence" ? (
                  <p className="mb-3 text-sm text-muted-foreground">{chatT("insufficientEvidence")}</p>
                ) : null}
                {message.role === "assistant" && message.resultType === "outside_document" ? (
                  <p className="mb-3 text-sm text-muted-foreground">{chatT("outsideDocument")}</p>
                ) : null}
                {message.role === "assistant" && message.resultType === "partial_coverage" ? (
                  <p className="mb-3 text-sm text-muted-foreground">{chatT("partialDocument")}</p>
                ) : null}
                <p className="break-words whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" && message.citations.length ? (
                  <CitationList citations={message.citations} locale={locale} />
                ) : null}
              </div>
            ) : null}
            {index === conversation.messages.length - 1 ? (
              <DocumentChatAutoScroll messageCount={conversation.messages.length} />
            ) : null}
          </li>
        ))}
      </ol>
      <aside className="mt-6 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        {chatT("verificationDisclaimer")}
        {conversation.language === "am" || conversation.language === "es" ? (
          <p className="mt-2">{chatT("translationVerification")}</p>
        ) : null}
      </aside>
      {record.context.canProcess ? (
        hasPendingResponse ? (
          <p className="mt-5 text-sm text-muted-foreground" role="status">
            {chatT("pendingResponse")}
          </p>
        ) : (
          <DocumentChatComposer conversationId={conversationId} documentId={documentId} locale={locale} />
        )
      ) : (
        <p className="mt-5 text-sm text-muted-foreground" role="status">
          {chatT("readOnly")}
        </p>
      )}
    </section>
  );
}
