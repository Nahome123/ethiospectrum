import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { SafeMarkdown } from "@/components/resources/safe-markdown";
import { getPublishedResource } from "@/lib/resources/server";

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const [t, resource] = await Promise.all([
    getTranslations({ locale, namespace: "resources" }),
    getPublishedResource(slug),
  ]);
  if (!resource) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <Link className="text-sm underline" href="/resources">
        {t("backToResources")}
      </Link>
      <article className="mt-6">
        <p className="text-sm text-muted-foreground">{t(`categories.${resource.category as "general"}`)}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{resource.english.title}</h1>
        <p className="mt-4 text-lg leading-7 text-muted-foreground">{resource.english.summary}</p>
        <div className="mt-8 border-t pt-8">
          <SafeMarkdown body={resource.english.body} />
        </div>
      </article>
    </main>
  );
}
