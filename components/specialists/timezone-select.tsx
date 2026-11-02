"use client";

import { useState } from "react";
import { commonScheduleZones } from "@/lib/specialists/schedule";
import { useFormResetKey } from "./use-form-reset-key";

/** A drop-down of every IANA time zone (`zones`), with the common ones listed first. */
export function TimezoneSelect({
  commonLabel,
  allLabel,
  defaultValue,
  id,
  zones,
}: {
  commonLabel: string;
  allLabel: string;
  defaultValue: string;
  id: string;
  zones: string[];
}) {
  const [value, setValue] = useState(defaultValue);
  const [ref, resetKey] = useFormResetKey<HTMLSelectElement>();
  const others = [...new Set([...zones, defaultValue])]
    .filter((zone) => !commonScheduleZones.includes(zone))
    .sort();
  const option = (zone: string) => (
    <option key={zone} value={zone}>
      {zone.replaceAll("_", " ")}
    </option>
  );
  return (
    <select
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      id={id}
      key={resetKey}
      name="timezone"
      onChange={(event) => setValue(event.target.value)}
      ref={ref}
      required
      value={value}
    >
      <optgroup label={commonLabel}>{commonScheduleZones.map(option)}</optgroup>
      <optgroup label={allLabel}>{others.map(option)}</optgroup>
    </select>
  );
}
