import { ArrowRight, BookOpen, FileText, MessageCircleQuestion, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function MemberPage({
  page,
}: {
  page: "dependents" | "documents" | "assistant" | "roadmap" | "resources" | "support" | "settings";
}) {
  const t = await getTranslations();

  if (page === "resources") {
    return (
      <section className="max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
          {t("resources.eyebrow")}
        </p>
        <h1 className="mt-3 font-heading text-3xl font-bold">{t("resources.title")}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{t("resources.pageIntro")}</p>

        <article className="mt-8 rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8">
          <BookOpen aria-hidden="true" className="size-9 text-primary" />
          <h2 className="mt-5 font-heading text-xl font-bold">{t("navigation.training")}</h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            {t("resources.rbtTrainingDescription")}
          </p>
          <Link
            className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            href="/training/rbt"
          >
            {t("resources.rbtTrainingAction")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </article>
      </section>
    );
  }

  const content = {
    dependents: ["emptyStates.dependentsTitle", "emptyStates.dependentsDescription", UsersRound],
    documents: ["emptyStates.documentsTitle", "emptyStates.documentsDescription", FileText],
    assistant: ["emptyStates.assistantTitle", "emptyStates.assistantDescription", MessageCircleQuestion],
    roadmap: ["emptyStates.roadmapTitle", "emptyStates.roadmapDescription", FileText],
    support: ["emptyStates.supportTitle", "emptyStates.supportDescription", MessageCircleQuestion],
    settings: ["member.settingsTitle", "member.settingsDescription", UsersRound],
  } as const;
  const [title, description, Icon] = content[page];
  return (
    <section className="max-w-3xl">
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-secondary-foreground">
        {t("common.developmentOnly")}
      </p>
      <div className="mt-4 rounded-xl border border-border bg-white p-8">
        <Icon aria-hidden="true" className="size-9 text-primary" />
        <h1 className="mt-5 text-3xl font-bold">{t(title)}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{t(description)}</p>
        <p className="mt-6 inline-block rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">
          {t("common.notConnected")}
        </p>
      </div>
    </section>
  );
}
