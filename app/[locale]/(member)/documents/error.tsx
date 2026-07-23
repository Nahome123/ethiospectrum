"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function DocumentsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("documents");
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-bold">{t("binderTitle")}</h1>
      <div className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="font-bold">{t("binderErrorTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{t("binderErrorDescription")}</p>
        <Button className="mt-4" onClick={reset} type="button">
          {t("retry")}
        </Button>
      </div>
    </section>
  );
}
