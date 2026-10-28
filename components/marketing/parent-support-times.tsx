"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { loadPublicParentSupportSlotsAction } from "@/lib/services/booking-actions";

type Slot = { specialistId: string; startAt: string };

const subscribeNever = () => () => undefined;

/** The next free Parent Support times, in the visitor's own time zone; each opens booking with it selected. */
export function ParentSupportTimes({
  labels,
}: {
  labels: { loading: string; none: string; more: string; timesIn: string };
}) {
  const locale = useLocale();
  const zone = useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => null,
  );
  const [slots, setSlots] = useState<Slot[] | null>(null);

  useEffect(() => {
    let active = true;
    loadPublicParentSupportSlotsAction()
      .then((result) => {
        if (active) setSlots(result);
      })
      .catch(() => {
        if (active) setSlots([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (slots === null || !zone) {
    return (
      <p className="mt-3 text-sm text-muted-foreground" role="status">
        {labels.loading}
      </p>
    );
  }
  if (slots.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{labels.none}</p>;
  }
  const format = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  });
  return (
    <div className="mt-3">
      <ul className="flex flex-wrap gap-2">
        {slots.slice(0, 8).map((slot) => (
          <li key={`${slot.specialistId}-${slot.startAt}`}>
            <Link
              className="inline-flex rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:border-emerald-700 hover:bg-emerald-100"
              href={`/services/parent-support?start=${encodeURIComponent(slot.startAt)}&specialist=${slot.specialistId}`}
            >
              {format.format(new Date(slot.startAt))}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {labels.timesIn.replace("{zone}", zone.replaceAll("_", " "))} ·{" "}
        <Link className="underline" href="/services/parent-support">
          {labels.more}
        </Link>
      </p>
    </div>
  );
}
