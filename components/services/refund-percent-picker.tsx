"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatCents } from "@/lib/services/constants";
import { defaultRefundPreset, refundPresetOptions } from "@/lib/services/refund-presets";
import { cn } from "@/lib/utils";

/**
 * Preset refund percentages of the original payment. The chosen amount is
 * shown in dollars before the form is confirmed and is submitted as
 * `amountCents`. When no preset fits the limit, the maximum allowed amount is
 * offered instead.
 */
export function RefundPercentPicker({
  locale,
  maxCents,
  name = "amountCents",
  originalCents,
}: {
  locale: string;
  maxCents: number;
  name?: string;
  originalCents: number;
}) {
  const t = useTranslations("services.staff");
  const options = refundPresetOptions(originalCents, maxCents);
  const fallback = defaultRefundPreset(options);
  const [selected, setSelected] = useState<number | null>(fallback?.percent ?? null);
  const chosen = options.find((option) => option.percent === selected && option.available);
  const amountCents = chosen ? chosen.amountCents : Math.max(0, maxCents);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t("refundPercentLabel")}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            aria-pressed={chosen?.percent === option.percent}
            className={cn(
              "min-h-10 rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              chosen?.percent === option.percent
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-white hover:bg-secondary",
              !option.available && "cursor-not-allowed opacity-50",
            )}
            disabled={!option.available}
            key={option.percent}
            onClick={() => setSelected(option.percent)}
            title={option.available ? undefined : t("refundPercentUnavailable")}
            type="button"
          >
            {option.percent}%
          </button>
        ))}
      </div>
      <p aria-live="polite" className="rounded-lg bg-slate-50 p-3 text-sm">
        {chosen
          ? t("refundPercentSummary", {
              amount: formatCents(amountCents, locale),
              percent: chosen.percent,
              original: formatCents(originalCents, locale),
            })
          : t("refundPercentFallback", { amount: formatCents(amountCents, locale) })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("refundPercentLimit", { max: formatCents(maxCents, locale) })}
      </p>
      <input name={name} type="hidden" value={amountCents} />
    </fieldset>
  );
}
