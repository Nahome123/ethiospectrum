"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INSTRUCTIONS_MAX, LOCATION_DETAILS_MAX, inPersonLocationValues } from "@/lib/services/constants";

const fallbackZones = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Africa/Addis_Ababa",
  "Europe/London",
  "UTC",
];

// Browser-only values are cached once so useSyncExternalStore snapshots stay stable.
let cachedZones: string[] | null = null;
let cachedBrowserZone: string | null = null;
let cachedMinimum: string | null = null;

function supportedZones(): string[] {
  if (cachedZones) return cachedZones;
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
      "timeZone",
    );
    cachedZones = zones && zones.length ? zones : fallbackZones;
  } catch {
    cachedZones = fallbackZones;
  }
  return cachedZones;
}

function browserZone(): string {
  if (cachedBrowserZone) return cachedBrowserZone;
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    cachedBrowserZone = supportedZones().includes(zone) ? zone : "America/Chicago";
  } catch {
    cachedBrowserZone = "America/Chicago";
  }
  return cachedBrowserZone;
}

function earliestLocalStart(): string {
  if (cachedMinimum) return cachedMinimum;
  const soon = new Date(Date.now() + 60 * 60 * 1000);
  soon.setMinutes(soon.getMinutes() - soon.getTimezoneOffset());
  cachedMinimum = soon.toISOString().slice(0, 16);
  return cachedMinimum;
}

const subscribeNever = () => () => undefined;

/** Server snapshot during SSR and hydration; the browser value afterwards. */
function useClientValue<T>(client: () => T, server: T): T {
  return useSyncExternalStore(subscribeNever, client, () => server);
}

type SlotFieldsProps = {
  idPrefix: string;
  deliveryMethod: "remote" | "in_person";
  maxSlots: 1 | 3;
  /** Options shown from the start, which cannot be removed (default 1). */
  minSlots?: number;
  /** A family's requested time(s): date, time and time zone only. */
  familyRequest?: boolean;
  defaults?: {
    localStart?: string;
    timezone?: string;
    locationType?: string;
    locationDetails?: string | null;
    meetingUrl?: string | null;
    instructions?: string | null;
  };
};

/**
 * Local date/time plus an explicit IANA time zone. The database converts the
 * pair to one instant and rejects nonexistent or ambiguous daylight-saving
 * times rather than guessing.
 */
export function SlotFields({
  idPrefix,
  deliveryMethod,
  maxSlots,
  minSlots = 1,
  familyRequest = false,
  defaults,
}: SlotFieldsProps) {
  const t = useTranslations("services.slots");
  const locations = useTranslations("services.locations");
  const [count, setCount] = useState(minSlots);
  const [location, setLocation] = useState(defaults?.locationType ?? "");
  const zones = useClientValue(supportedZones, fallbackZones);
  const detectedZone = useClientValue(browserZone, "America/Chicago");
  const minimum = useClientValue<string | undefined>(earliestLocalStart, undefined);
  const [chosenZone, setZone] = useState<string | null>(null);
  const zone = chosenZone ?? defaults?.timezone ?? detectedZone;

  return (
    <div className="space-y-4">
      <input name="slotCount" type="hidden" value={count} />
      <div className="space-y-3">
        {Array.from({ length: count }, (_, index) => (
          <div className="space-y-1.5" key={index}>
            <Label htmlFor={`${idPrefix}-slot-${index}`}>
              {maxSlots > 1 ? t("option", { number: index + 1 }) : t("dateTime")} *
            </Label>
            <Input
              defaultValue={index === 0 ? defaults?.localStart : undefined}
              id={`${idPrefix}-slot-${index}`}
              min={minimum}
              name={`slot.${index}.localStart`}
              required
              type="datetime-local"
            />
          </div>
        ))}
        {maxSlots > 1 ? (
          <div className="flex gap-2">
            {count < maxSlots ? (
              <Button
                onClick={() => setCount((value) => value + 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("addOption")}
              </Button>
            ) : null}
            {count > minSlots ? (
              <Button onClick={() => setCount((value) => value - 1)} size="sm" type="button" variant="ghost">
                {t("removeOption")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-timezone`}>{t("timezone")} *</Label>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3"
          id={`${idPrefix}-timezone`}
          name="timezone"
          onChange={(event) => setZone(event.target.value)}
          value={zones.includes(zone) ? zone : zones[0]}
          required
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      {familyRequest ? null : (
        <>
          {deliveryMethod === "in_person" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-location`}>{t("location")} *</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  id={`${idPrefix}-location`}
                  name="locationType"
                  onChange={(event) => setLocation(event.target.value)}
                  required
                  value={location}
                >
                  <option value="">{t("chooseLocation")}</option>
                  {inPersonLocationValues.map((value) => (
                    <option key={value} value={value}>
                      {locations(value)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-details`}>{t("locationDetails")}</Label>
                <Input
                  defaultValue={defaults?.locationDetails ?? undefined}
                  id={`${idPrefix}-details`}
                  maxLength={LOCATION_DETAILS_MAX}
                  name="locationDetails"
                  required={location === "school_meeting" || location === "mutually_agreed"}
                />
              </div>
            </div>
          ) : (
            <>
              <input name="locationType" type="hidden" value="remote" />
              <input name="locationDetails" type="hidden" value="" />
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-url`}>{t("meetingUrl")}</Label>
                <Input
                  defaultValue={defaults?.meetingUrl ?? undefined}
                  id={`${idPrefix}-url`}
                  name="meetingUrl"
                  pattern="https://.*"
                  placeholder="https://"
                  type="url"
                />
                <p className="text-xs text-muted-foreground">{t("meetingUrlHelp")}</p>
              </div>
            </>
          )}
          {deliveryMethod === "in_person" ? <input name="meetingUrl" type="hidden" value="" /> : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-instructions`}>{t("instructions")}</Label>
            <Textarea
              defaultValue={defaults?.instructions ?? undefined}
              id={`${idPrefix}-instructions`}
              maxLength={INSTRUCTIONS_MAX}
              name="instructions"
              placeholder={t("instructionsPlaceholder")}
              rows={2}
            />
          </div>
        </>
      )}
    </div>
  );
}
