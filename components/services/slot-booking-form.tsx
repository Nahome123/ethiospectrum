"use client";

import { useActionState, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/i18n/routing";
import { initialServiceActionState } from "@/lib/services/action-state";
import { bookServiceSlotAction, loadOpenSlotsAction } from "@/lib/services/booking-actions";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  RELEVANT_INFORMATION_MAX,
  consultationCategoryValues,
  sessionLanguageValues,
  type ConsultationCategory,
} from "@/lib/services/constants";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type Topic = { key: string; category: string; label: string };
type Specialist = { id: string; name: string; bio: string | null; languages: string[] };
type Slot = { specialistId: string; startAt: string; endAt: string };

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";
const ANY = "any";

const subscribeNever = () => () => undefined;
function useBrowserZone(): string | null {
  return useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        return "UTC";
      }
    },
    () => null,
  );
}

/**
 * Book a self-scheduled service: choose who (a specialist or "either"), the
 * language, and an open time shown in the family's own time zone. Paid
 * services continue to Checkout; free ones are confirmed immediately.
 */
export function SlotBookingForm({
  dependents,
  initialChoice,
  initialSlots,
  locale,
  serviceType,
  specialists,
  topics = [],
}: {
  dependents: Option[];
  /** A time chosen before arriving (for example on the home page). */
  initialChoice?: { specialistId: string; startAt: string } | null;
  initialSlots: Slot[];
  locale: AppLocale;
  serviceType: "consultation" | "parent_support";
  specialists: Specialist[];
  topics?: Topic[];
}) {
  const t = useTranslations("services.booking");
  const form = useTranslations("services.form");
  const categories = useTranslations("services.categories");
  const languages = useTranslations("services.languages");
  const zone = useBrowserZone();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    bookServiceSlotAction.bind(null, locale),
    initialServiceActionState,
  );
  const [category, setCategory] = useState<ConsultationCategory>("general_guidance");
  const offeredLanguages = useMemo(
    () => sessionLanguageValues.filter((value) => specialists.some((item) => item.languages.includes(value))),
    [specialists],
  );
  const [language, setLanguage] = useState<string>(
    offeredLanguages.includes(locale) ? locale : (offeredLanguages[0] ?? "en"),
  );
  const [specialistId, setSpecialistId] = useState<string>(
    specialists.length === 1
      ? specialists[0].id
      : initialChoice && specialists.some((item) => item.id === initialChoice.specialistId)
        ? initialChoice.specialistId
        : ANY,
  );
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [chosen, setChosen] = useState<Slot | null>(
    () =>
      initialSlots.find(
        (slot) =>
          initialChoice &&
          slot.specialistId === initialChoice.specialistId &&
          new Date(slot.startAt).getTime() === new Date(initialChoice.startAt).getTime(),
      ) ?? null,
  );
  const [loading, startLoading] = useTransition();
  const consultation = serviceType === "consultation";
  const names = useMemo(() => new Map(specialists.map((item) => [item.id, item.name])), [specialists]);
  const visibleSpecialists = specialists.filter((item) => item.languages.includes(language));

  useEffect(() => {
    if (state.status === "success" && state.url) window.location.assign(state.url);
  }, [state]);

  function reload(nextLanguage: string, nextSpecialist: string) {
    setChosen(null);
    startLoading(async () => {
      setSlots(await loadOpenSlotsAction(serviceType, nextLanguage, nextSpecialist));
    });
  }

  const days = useMemo(() => {
    if (!zone) return [];
    const dayFormat = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: zone,
    });
    const groups = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = dayFormat.format(new Date(slot.startAt));
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots, zone, locale]);
  const timeFormat = zone
    ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: zone })
    : null;

  return (
    <form action={action} className="space-y-6">
      <input name="serviceType" type="hidden" value={serviceType} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="timezone" type="hidden" value={zone ?? "UTC"} />
      <input name="specialistId" type="hidden" value={chosen?.specialistId ?? ""} />
      <input name="startAt" type="hidden" value={chosen?.startAt ?? ""} />

      <div className="space-y-1.5">
        <Label htmlFor="booking-dependent">{form("dependent")} *</Label>
        <select className={selectClass} id="booking-dependent" name="dependentId" required>
          {dependents.map((dependent) => (
            <option key={dependent.id} value={dependent.id}>
              {dependent.name}
            </option>
          ))}
        </select>
      </div>

      {consultation ? (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{form("serviceCategory")} *</legend>
            {consultationCategoryValues.map((value) => (
              <label className="flex items-start gap-2 text-sm" key={value}>
                <input
                  checked={category === value}
                  className="mt-1 size-4"
                  name="category"
                  onChange={() => setCategory(value)}
                  type="radio"
                  value={value}
                />
                <span>{categories(value)}</span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="booking-topic">{form("topic")}</Label>
            <select className={selectClass} id="booking-topic" key={category} name="topicKey">
              <option value="">{form("topicAny")}</option>
              {topics
                .filter((topic) => topic.category === category)
                .map((topic) => (
                  <option key={topic.key} value={topic.key}>
                    {topic.label}
                  </option>
                ))}
            </select>
          </div>
        </>
      ) : (
        <>
          <input name="category" type="hidden" value="" />
          <input name="topicKey" type="hidden" value="" />
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="booking-description">
          {consultation ? form("needDescription") : t("parentSupportTopic")} *
        </Label>
        <Textarea
          id="booking-description"
          maxLength={DESCRIPTION_MAX}
          minLength={DESCRIPTION_MIN}
          name="description"
          required
          rows={4}
        />
      </div>
      {consultation ? (
        <div className="space-y-1.5">
          <Label htmlFor="booking-relevant">{form("relevantInformation")}</Label>
          <Textarea
            id="booking-relevant"
            maxLength={RELEVANT_INFORMATION_MAX}
            name="relevantInformation"
            rows={3}
          />
        </div>
      ) : null}

      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">{t("whoAndWhen")}</legend>
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="booking-language">{form("preferredLanguage")} *</Label>
          <select
            className={selectClass}
            id="booking-language"
            name="language"
            onChange={(event) => {
              const next = event.target.value;
              const keeps = specialists.some(
                (item) => item.id === specialistId && item.languages.includes(next),
              );
              const nextSpecialist = keeps ? specialistId : ANY;
              setLanguage(next);
              setSpecialistId(nextSpecialist);
              reload(next, nextSpecialist);
            }}
            value={language}
          >
            {offeredLanguages.map((value) => (
              <option key={value} value={value}>
                {languages(value)}
              </option>
            ))}
          </select>
        </div>

        {visibleSpecialists.length > 1 ? (
          <div role="radiogroup" aria-label={t("chooseSpecialist")} className="grid gap-3 sm:grid-cols-2">
            {[
              { id: ANY, name: t("either"), bio: t("eitherHelp"), languages: [] as string[] },
              ...visibleSpecialists,
            ].map((item) => (
              <label
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-4 text-sm",
                  specialistId === item.id ? "border-primary bg-tint" : "hover:bg-muted",
                )}
                key={item.id}
              >
                <input
                  checked={specialistId === item.id}
                  className="mt-1 size-4"
                  name="specialistChoice"
                  onChange={() => {
                    setSpecialistId(item.id);
                    reload(language, item.id);
                  }}
                  type="radio"
                  value={item.id}
                />
                <span>
                  <span className="block font-semibold">{item.name}</span>
                  {item.languages.length ? (
                    <span className="block text-xs text-muted-foreground">
                      {item.languages.map((value) => languages(value)).join(" · ")}
                    </span>
                  ) : null}
                  {item.bio ? <span className="mt-1 block text-muted-foreground">{item.bio}</span> : null}
                </span>
              </label>
            ))}
          </div>
        ) : visibleSpecialists.length === 1 ? (
          <p className="text-sm">
            {t("withSpecialist", { name: visibleSpecialists[0].name })}
            {visibleSpecialists[0].bio ? (
              <span className="mt-1 block text-muted-foreground">{visibleSpecialists[0].bio}</span>
            ) : null}
          </p>
        ) : null}

        <div aria-busy={loading} className="space-y-3">
          <p className="text-sm font-medium">
            {t("chooseTime")}
            {zone ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {t("shownIn", { zone: zone.replaceAll("_", " ") })}
              </span>
            ) : null}
          </p>
          {!zone || loading ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("loadingTimes")}
            </p>
          ) : days.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm" role="status">
              {t("noTimes")}
            </p>
          ) : (
            <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
              {days.map(([day, daySlots]) => (
                <div key={day}>
                  <p className="text-sm font-semibold">{day}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {daySlots.map((slot) => {
                      const selected =
                        chosen?.startAt === slot.startAt && chosen.specialistId === slot.specialistId;
                      return (
                        <button
                          aria-pressed={selected}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm font-semibold",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-white hover:border-primary",
                          )}
                          key={`${slot.specialistId}-${slot.startAt}`}
                          onClick={() => setChosen(slot)}
                          type="button"
                        >
                          {timeFormat?.format(new Date(slot.startAt))}
                          {specialistId === ANY && visibleSpecialists.length > 1 ? (
                            <span className="ml-1 font-normal opacity-80">
                              · {names.get(slot.specialistId)}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {chosen && timeFormat ? (
            <p
              className="rounded-lg border border-primary/40 bg-tint p-3 text-sm font-semibold"
              role="status"
            >
              {t("selected", {
                time: new Intl.DateTimeFormat(locale, {
                  dateStyle: "full",
                  timeStyle: "short",
                  timeZone: zone ?? "UTC",
                }).format(new Date(chosen.startAt)),
                name: names.get(chosen.specialistId) ?? "",
              })}
            </p>
          ) : null}
        </div>
      </fieldset>

      <p className="rounded-xl border bg-secondary/40 p-4 text-sm leading-6">
        {consultation ? t("nextStepsPaid") : t("nextStepsFree")}
      </p>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending || !chosen} size="lg" type="submit">
        {pending ? t("booking") : consultation ? t("bookAndPay") : t("bookFree")}
      </Button>
    </form>
  );
}
