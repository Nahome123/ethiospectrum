import { commonScheduleZones } from "@/lib/specialists/schedule";

/** A drop-down of every IANA time zone, with the common ones listed first. */
export function TimezoneSelect({
  commonLabel,
  allLabel,
  defaultValue,
  id,
}: {
  commonLabel: string;
  allLabel: string;
  defaultValue: string;
  id: string;
}) {
  const zones = [...new Set([...Intl.supportedValuesOf("timeZone"), "UTC", defaultValue])].sort();
  return (
    <select
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      defaultValue={defaultValue}
      id={id}
      name="timezone"
      required
    >
      <optgroup label={commonLabel}>
        {commonScheduleZones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </optgroup>
      <optgroup label={allLabel}>
        {zones
          .filter((zone) => !commonScheduleZones.includes(zone))
          .map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
      </optgroup>
    </select>
  );
}
