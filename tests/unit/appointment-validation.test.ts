import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_CONSENT_COPY_VERSION,
  APPOINTMENT_MAX_ACTIVE_PER_REQUEST,
  appointmentCancellationReasonValues,
  appointmentDurationValues,
  appointmentModalityValues,
  appointmentStatusValues,
  canAdministratorActOnAppointment,
  canCancelAppointment,
  canCompleteAppointment,
  canConsentToAppointment,
  canProposeAppointment,
  canTransitionAppointment,
  isTerminalAppointmentStatus,
  requiresMeetingUrl,
} from "@/lib/appointments/constants";
import {
  AppointmentScheduleError,
  appointmentsOverlap,
  isSupportedTimezone,
  resolveAppointmentInstant,
} from "@/lib/appointments/scheduling";
import {
  appointmentExpectedVersionSchema,
  appointmentMeetingUrlSchema,
  appointmentTimezoneSchema,
  createAppointmentConsentSchema,
  createAppointmentProposalSchema,
} from "@/lib/validation/appointments";

const messages = {
  date: "date-error",
  time: "time-error",
  timezone: "timezone-error",
  duration: "duration-error",
  modality: "modality-error",
  meetingUrl: "url-error",
};

function validProposal(overrides: Record<string, unknown> = {}) {
  return {
    localDate: "2026-09-15",
    localTime: "14:30",
    timezone: "America/New_York",
    durationMinutes: "45",
    modality: "video",
    meetingUrl: "https://meet.example.test/synthetic",
    ...overrides,
  };
}

describe("appointment proposal validation", () => {
  it("accepts a valid video proposal", () => {
    expect(createAppointmentProposalSchema(messages).safeParse(validProposal()).success).toBe(true);
  });

  it("accepts a phone proposal with no meeting link", () => {
    const result = createAppointmentProposalSchema(messages).safeParse(
      validProposal({ modality: "phone", meetingUrl: "" }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.meetingUrl).toBeNull();
  });

  it("rejects a phone proposal that carries a link", () => {
    expect(
      createAppointmentProposalSchema(messages).safeParse(
        validProposal({ modality: "phone", meetingUrl: "https://meet.example.test/x" }),
      ).success,
    ).toBe(false);
  });

  it("rejects a video proposal without a link", () => {
    expect(
      createAppointmentProposalSchema(messages).safeParse(validProposal({ meetingUrl: "" })).success,
    ).toBe(false);
  });

  it.each([
    ["http", "http://meet.example.test/x"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,<script>"],
    ["file", "file:///etc/passwd"],
  ])("rejects a %s meeting link", (_label, url) => {
    expect(appointmentMeetingUrlSchema.safeParse(url).success).toBe(false);
    expect(
      createAppointmentProposalSchema(messages).safeParse(validProposal({ meetingUrl: url })).success,
    ).toBe(false);
  });

  it.each([
    ["bad date", { localDate: "15-09-2026" }],
    ["bad time", { localTime: "2:30 PM" }],
    ["unknown timezone", { timezone: "Not/AZone" }],
    ["unsupported duration", { durationMinutes: "25" }],
    ["unsupported modality", { modality: "in_person" }],
  ])("rejects %s", (_label, override) => {
    expect(createAppointmentProposalSchema(messages).safeParse(validProposal(override)).success).toBe(false);
  });

  it("keeps the supported allowlists fixed", () => {
    expect(appointmentDurationValues).toEqual([30, 45, 60]);
    expect(appointmentModalityValues).toEqual(["video", "phone"]);
    expect(appointmentModalityValues).not.toContain("in_person");
    expect(appointmentStatusValues).toEqual(["proposed", "scheduled", "declined", "cancelled", "completed"]);
    expect(appointmentCancellationReasonValues).toEqual([
      "household_cancelled",
      "specialist_cancelled",
      "reschedule_requested",
      "assignment_revoked",
      "request_closed",
      "request_cancelled",
    ]);
    expect(APPOINTMENT_MAX_ACTIVE_PER_REQUEST).toBe(1);
    expect(requiresMeetingUrl("video")).toBe(true);
    expect(requiresMeetingUrl("phone")).toBe(false);
  });

  it("requires an explicit consent acknowledgment", () => {
    const schema = createAppointmentConsentSchema("consent-error");
    for (const value of [true, "true", "on"]) {
      expect(schema.safeParse({ acknowledged: value }).success).toBe(true);
    }
    for (const value of [false, "", "no"]) {
      expect(schema.safeParse({ acknowledged: value }).success).toBe(false);
    }
  });

  it("rejects a blank expected version rather than coercing it", () => {
    expect(appointmentExpectedVersionSchema.safeParse("").success).toBe(false);
    expect(appointmentExpectedVersionSchema.safeParse("0").success).toBe(false);
    expect(appointmentExpectedVersionSchema.safeParse("2").success).toBe(true);
  });

  it("validates IANA timezone names", () => {
    expect(appointmentTimezoneSchema.safeParse("Africa/Addis_Ababa").success).toBe(true);
    expect(appointmentTimezoneSchema.safeParse("America/New_York").success).toBe(true);
    expect(appointmentTimezoneSchema.safeParse("Not/AZone").success).toBe(false);
    expect(isSupportedTimezone("UTC")).toBe(true);
    expect(isSupportedTimezone("")).toBe(false);
  });

  it("keeps the consent copy version server-controlled", () => {
    expect(APPOINTMENT_CONSENT_COPY_VERSION).toBe("eth-027.v1");
  });
});

describe("appointment scheduling and daylight saving", () => {
  const base = Temporal.Instant.from("2026-09-01T00:00:00Z");

  it("resolves a normal local time to a UTC instant", () => {
    const result = resolveAppointmentInstant({
      localDate: "2026-09-15",
      localTime: "14:30",
      timezone: "America/New_York",
      durationMinutes: 45,
      now: base,
    });
    expect(result.startsAtUtc).toBe("2026-09-15T18:30:00Z");
    expect(result.endsAtUtc).toBe("2026-09-15T19:15:00Z");
    expect(result.offsetMinutes).toBe(-240);
  });

  it("rejects a nonexistent spring-forward local time", () => {
    expect(() =>
      resolveAppointmentInstant({
        localDate: "2027-03-14",
        localTime: "02:30",
        timezone: "America/New_York",
        durationMinutes: 30,
        now: Temporal.Instant.from("2027-03-01T00:00:00Z"),
      }),
    ).toThrow(AppointmentScheduleError);
    try {
      resolveAppointmentInstant({
        localDate: "2027-03-14",
        localTime: "02:30",
        timezone: "America/New_York",
        durationMinutes: 30,
        now: Temporal.Instant.from("2027-03-01T00:00:00Z"),
      });
    } catch (error) {
      expect((error as AppointmentScheduleError).code).toBe("nonexistent_time");
    }
  });

  it("rejects an ambiguous fall-back local time rather than guessing an offset", () => {
    try {
      resolveAppointmentInstant({
        localDate: "2026-11-01",
        localTime: "01:30",
        timezone: "America/New_York",
        durationMinutes: 30,
        now: base,
      });
      throw new Error("expected an ambiguous-time rejection");
    } catch (error) {
      expect((error as AppointmentScheduleError).code).toBe("ambiguous_time");
    }
  });

  it("enforces the 24-hour lead time and 90-day horizon", () => {
    const tooSoon = () =>
      resolveAppointmentInstant({
        localDate: "2026-09-01",
        localTime: "06:00",
        timezone: "UTC",
        durationMinutes: 30,
        now: base,
      });
    expect(tooSoon).toThrow(AppointmentScheduleError);

    const tooFar = () =>
      resolveAppointmentInstant({
        localDate: "2027-06-01",
        localTime: "10:00",
        timezone: "UTC",
        durationMinutes: 30,
        now: base,
      });
    expect(tooFar).toThrow(AppointmentScheduleError);
  });

  it("rejects an unknown timezone", () => {
    expect(() =>
      resolveAppointmentInstant({
        localDate: "2026-09-15",
        localTime: "10:00",
        timezone: "Not/AZone",
        durationMinutes: 30,
        now: base,
      }),
    ).toThrow(AppointmentScheduleError);
  });

  it("treats back-to-back appointments as non-overlapping", () => {
    const first = { startsAt: "2026-09-15T18:00:00Z", endsAt: "2026-09-15T18:45:00Z" };
    const backToBack = { startsAt: "2026-09-15T18:45:00Z", endsAt: "2026-09-15T19:15:00Z" };
    const overlapping = { startsAt: "2026-09-15T18:30:00Z", endsAt: "2026-09-15T19:00:00Z" };
    expect(appointmentsOverlap(first, backToBack)).toBe(false);
    expect(appointmentsOverlap(first, overlapping)).toBe(true);
  });
});

describe("appointment lifecycle and permission matrix", () => {
  it("permits only the defined transitions", () => {
    expect(canTransitionAppointment("proposed", "scheduled")).toBe(true);
    expect(canTransitionAppointment("proposed", "declined")).toBe(true);
    expect(canTransitionAppointment("proposed", "cancelled")).toBe(true);
    expect(canTransitionAppointment("scheduled", "cancelled")).toBe(true);
    expect(canTransitionAppointment("scheduled", "completed")).toBe(true);
    expect(canTransitionAppointment("proposed", "completed")).toBe(false);
    expect(canTransitionAppointment("scheduled", "declined")).toBe(false);
    expect(canTransitionAppointment("cancelled", "scheduled")).toBe(false);
    expect(canTransitionAppointment("completed", "scheduled")).toBe(false);
    expect(canTransitionAppointment("declined", "proposed")).toBe(false);
  });

  it("treats declined, cancelled, and completed as terminal", () => {
    expect(isTerminalAppointmentStatus("declined")).toBe(true);
    expect(isTerminalAppointmentStatus("cancelled")).toBe(true);
    expect(isTerminalAppointmentStatus("completed")).toBe(true);
    expect(isTerminalAppointmentStatus("proposed")).toBe(false);
    expect(isTerminalAppointmentStatus("scheduled")).toBe(false);
  });

  it("lets only the assigned specialist propose on an open request", () => {
    expect(canProposeAppointment(true, "open")).toBe(true);
    expect(canProposeAppointment(false, "open")).toBe(false);
    expect(canProposeAppointment(true, "closed")).toBe(false);
    expect(canProposeAppointment(true, "cancelled")).toBe(false);
  });

  it("limits consent to non-viewer household roles on a proposal", () => {
    expect(canConsentToAppointment("owner", "proposed")).toBe(true);
    expect(canConsentToAppointment("administrator", "proposed")).toBe(true);
    expect(canConsentToAppointment("member", "proposed")).toBe(true);
    expect(canConsentToAppointment("viewer", "proposed")).toBe(false);
    expect(canConsentToAppointment(null, "proposed")).toBe(false);
    expect(canConsentToAppointment("owner", "scheduled")).toBe(false);
  });

  it("allows cancellation by caregivers or the assigned specialist while live", () => {
    expect(canCancelAppointment("owner", false, "proposed")).toBe(true);
    expect(canCancelAppointment("member", false, "scheduled")).toBe(true);
    expect(canCancelAppointment(null, true, "scheduled")).toBe(true);
    expect(canCancelAppointment("viewer", false, "scheduled")).toBe(false);
    expect(canCancelAppointment(null, false, "scheduled")).toBe(false);
    expect(canCancelAppointment("owner", true, "completed")).toBe(false);
  });

  it("allows completion only by the specialist after the start time", () => {
    const start = new Date("2026-09-15T18:30:00Z");
    const after = new Date("2026-09-15T19:00:00Z");
    const before = new Date("2026-09-15T18:00:00Z");
    expect(canCompleteAppointment(true, "scheduled", start, after)).toBe(true);
    expect(canCompleteAppointment(true, "scheduled", start, before)).toBe(false);
    expect(canCompleteAppointment(false, "scheduled", start, after)).toBe(false);
    expect(canCompleteAppointment(true, "proposed", start, after)).toBe(false);
  });

  it("never lets a platform administrator act on an appointment", () => {
    expect(canAdministratorActOnAppointment()).toBe(false);
  });
});
