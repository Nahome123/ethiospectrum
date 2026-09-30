import { describe, expect, it } from "vitest";
import {
  appointmentSlotSchema,
  appointmentSlotsSchema,
  createConsultationRequestSchema,
  createIepRequestSchema,
  moneyInputSchema,
  toDatabaseSlot,
} from "@/lib/validation/services";

const messages = {
  description: "description",
  dependent: "dependent",
  services: "services",
  location: "location",
  meetingDate: "meetingDate",
};
const dependentId = "10000000-0000-4000-8000-000000000001";

describe("consultation request validation (PRD section 34)", () => {
  const schema = createConsultationRequestSchema(messages);

  it("accepts the required fields and normalizes optional ones", () => {
    const result = schema.parse({
      dependentId,
      description: "Help with bedtime routines at home.",
      relevantInformation: "  ",
      category: "behavioral_educational",
      topicKey: "",
      preferredLanguage: "am",
    });
    expect(result).toMatchObject({ relevantInformation: null, topicKey: null, preferredLanguage: "am" });
  });

  it.each([
    ["short description", { description: "short" }],
    ["unknown category", { category: "legal_advice" }],
    ["unsupported language", { preferredLanguage: "fr" }],
    ["forged dependent", { dependentId: "not-a-uuid" }],
  ])("rejects a %s", (_label, override) => {
    expect(
      schema.safeParse({
        dependentId,
        description: "Help with bedtime routines at home.",
        relevantInformation: "",
        category: "general_guidance",
        topicKey: "",
        preferredLanguage: "en",
        ...override,
      }).success,
    ).toBe(false);
  });
});

describe("IEP request validation (PRD section 35)", () => {
  const schema = createIepRequestSchema(messages);
  const base = {
    dependentId,
    description: "Explain the annual IEP and attend the meeting.",
    relevantInformation: "",
    language: "am",
    services: ["iep_explanation", "written_translation"],
    deliveryMethod: "remote",
    locationType: "",
    locationDetails: "",
    meetingDate: "",
  };

  it("accepts a remote request with written translation", () => {
    expect(schema.parse(base)).toMatchObject({
      services: ["iep_explanation", "written_translation"],
      locationType: null,
    });
  });

  it("supports only English <-> Amharic and English <-> Spanish", () => {
    expect(schema.safeParse({ ...base, language: "es" }).success).toBe(true);
    expect(schema.safeParse({ ...base, language: "en" }).success).toBe(false);
    expect(schema.safeParse({ ...base, language: "fr" }).success).toBe(false);
  });

  it("requires at least one IEP service", () => {
    expect(schema.safeParse({ ...base, services: [] }).success).toBe(false);
    expect(schema.safeParse({ ...base, services: ["notary"] }).success).toBe(false);
  });

  it("requires an approved location for in-person delivery and details for schools or agreed places", () => {
    expect(schema.safeParse({ ...base, deliveryMethod: "in_person" }).success).toBe(false);
    expect(
      schema.safeParse({ ...base, deliveryMethod: "in_person", locationType: "ethiospectrum_location" })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...base, deliveryMethod: "in_person", locationType: "school_meeting" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        deliveryMethod: "in_person",
        locationType: "school_meeting",
        locationDetails: "Lincoln Elementary",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...base, deliveryMethod: "in_person", locationType: "home_visit" }).success,
    ).toBe(false);
  });
});

describe("appointment slot validation", () => {
  const slot = {
    localStart: "2026-10-15T14:30",
    timezone: "America/Chicago",
    locationType: "",
    locationDetails: "",
    meetingUrl: "https://meet.example.test/room",
    instructions: "Please check in at the main office upon arrival.",
  };

  it("accepts a local date-time with an IANA time zone", () => {
    expect(toDatabaseSlot(appointmentSlotSchema.parse(slot))).toEqual({
      local_start: "2026-10-15T14:30",
      timezone: "America/Chicago",
      location_type: null,
      location_details: null,
      meeting_url: "https://meet.example.test/room",
      instructions: "Please check in at the main office upon arrival.",
    });
  });

  it("rejects insecure meeting links and malformed times", () => {
    expect(appointmentSlotSchema.safeParse({ ...slot, meetingUrl: "http://meet.example.test" }).success).toBe(
      false,
    );
    expect(appointmentSlotSchema.safeParse({ ...slot, localStart: "2026-10-15 14:30" }).success).toBe(false);
    expect(appointmentSlotSchema.safeParse({ ...slot, timezone: "Chicago; drop table" }).success).toBe(false);
  });

  it("accepts one to three proposed options", () => {
    expect(appointmentSlotsSchema.safeParse([]).success).toBe(false);
    expect(appointmentSlotsSchema.safeParse([slot, slot, slot]).success).toBe(true);
    expect(appointmentSlotsSchema.safeParse([slot, slot, slot, slot]).success).toBe(false);
  });
});

describe("administrator money input", () => {
  it.each([
    ["9.99", 999],
    ["19.99", 1999],
    ["25", 2500],
    ["0.5", 50],
  ])("parses %s as %s cents", (input, cents) => {
    expect(moneyInputSchema.parse(input)).toBe(cents);
  });

  it.each(["-1", "1.999", "abc", "1,000"])("rejects %s", (input) => {
    expect(moneyInputSchema.safeParse(input).success).toBe(false);
  });
});
