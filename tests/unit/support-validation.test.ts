import { describe, expect, it } from "vitest";
import {
  canAddSupportMessage,
  canCloseOrCancelSupportRequest,
  canCreateSupportRequest,
  canTransitionSupportStatus,
  supportCategoryValues,
} from "@/lib/support/constants";
import { parseSupportQuery, supportQueryString } from "@/lib/support/query-state";
import {
  createSupportMessageSchema,
  createSupportRequestSchema,
  supportExpectedVersionSchema,
  supportRequestIdSchema,
} from "@/lib/validation/support";

const messages = {
  subject: "subject-error",
  description: "description-error",
  acknowledgment: "acknowledgment-error",
};

function validRequest() {
  return {
    subject: "School meeting help",
    category: "education",
    preferredLanguage: "am",
    description: "We need help preparing for an upcoming school evaluation meeting.",
    acknowledged: "on",
  };
}

describe("support request validation", () => {
  it("accepts a valid request and trims outer whitespace", () => {
    const result = createSupportRequestSchema(messages).safeParse({
      ...validRequest(),
      subject: "  School meeting help  ",
      description: `  ${validRequest().description}  `,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe("School meeting help");
      expect(result.data.description).toBe(validRequest().description);
    }
  });

  it.each([
    ["short subject", { subject: "Hey" }, "subject-error"],
    ["long subject", { subject: "x".repeat(121) }, "subject-error"],
    ["whitespace subject", { subject: "   " }, "subject-error"],
    ["short description", { description: "Too short." }, "description-error"],
    ["long description", { description: "x".repeat(3001) }, "description-error"],
    ["whitespace description", { description: " ".repeat(40) }, "description-error"],
    ["unchecked acknowledgment", { acknowledged: "" }, "acknowledgment-error"],
    ["false acknowledgment", { acknowledged: false }, "acknowledgment-error"],
  ])("rejects %s with the mapped message", (_label, override, expected) => {
    const result = createSupportRequestSchema(messages).safeParse({ ...validRequest(), ...override });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(expected);
    }
  });

  it.each([
    ["category", { category: "emergency" }],
    ["category casing", { category: "Education" }],
    ["language", { preferredLanguage: "fr" }],
  ])("rejects an unlisted %s", (_label, override) => {
    expect(createSupportRequestSchema(messages).safeParse({ ...validRequest(), ...override }).success).toBe(
      false,
    );
  });

  it("accepts boolean and string acknowledgment shapes", () => {
    for (const acknowledged of [true, "true", "on"]) {
      expect(
        createSupportRequestSchema(messages).safeParse({ ...validRequest(), acknowledged }).success,
      ).toBe(true);
    }
  });

  it("keeps the category allowlist fixed", () => {
    expect(supportCategoryValues).toEqual([
      "general",
      "benefits",
      "education",
      "healthcare_navigation",
      "therapy_support",
      "housing",
      "transportation",
      "documentation",
      "other",
    ]);
  });

  it("bounds follow-up messages between 1 and 2,000 characters", () => {
    const schema = createSupportMessageSchema("message-error");
    expect(schema.safeParse({ body: "  A quick update.  " }).success).toBe(true);
    expect(schema.safeParse({ body: "   " }).success).toBe(false);
    expect(schema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
    const trimmed = schema.safeParse({ body: "  A quick update.  " });
    if (trimmed.success) expect(trimmed.data.body).toBe("A quick update.");
  });

  it("validates identifiers, versions, and query state", () => {
    expect(supportRequestIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(supportRequestIdSchema.safeParse("84000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(supportExpectedVersionSchema.safeParse("3").success).toBe(true);
    expect(supportExpectedVersionSchema.safeParse("0").success).toBe(false);
    expect(supportExpectedVersionSchema.safeParse("abc").success).toBe(false);
  });

  it("normalizes untrusted URL query state to safe defaults", () => {
    expect(parseSupportQuery({})).toEqual({ status: null, category: null, page: 1 });
    expect(parseSupportQuery({ status: "open", category: "housing", page: "3" })).toEqual({
      status: "open",
      category: "housing",
      page: 3,
    });
    expect(parseSupportQuery({ status: "hacked", category: "'; drop table", page: "-2" })).toEqual({
      status: null,
      category: null,
      page: 1,
    });
    expect(parseSupportQuery({ status: ["closed", "open"], page: ["2"] })).toEqual({
      status: "closed",
      category: null,
      page: 2,
    });
    expect(supportQueryString({ status: "closed", category: null, page: 2 })).toBe("?status=closed&page=2");
    expect(supportQueryString({ status: null, category: null, page: 1 })).toBe("");
  });
});

describe("support lifecycle and permission matrix", () => {
  it("permits only open to closed and open to cancelled transitions", () => {
    expect(canTransitionSupportStatus("open", "closed")).toBe(true);
    expect(canTransitionSupportStatus("open", "cancelled")).toBe(true);
    expect(canTransitionSupportStatus("closed", "open")).toBe(false);
    expect(canTransitionSupportStatus("cancelled", "open")).toBe(false);
    expect(canTransitionSupportStatus("closed", "cancelled")).toBe(false);
    expect(canTransitionSupportStatus("cancelled", "closed")).toBe(false);
  });

  it("lets owners, administrators, and members create while viewers cannot", () => {
    expect(canCreateSupportRequest("owner")).toBe(true);
    expect(canCreateSupportRequest("administrator")).toBe(true);
    expect(canCreateSupportRequest("member")).toBe(true);
    expect(canCreateSupportRequest("viewer")).toBe(false);
  });

  it("limits messages to non-viewers on open requests", () => {
    expect(canAddSupportMessage("member", "open")).toBe(true);
    expect(canAddSupportMessage("owner", "open")).toBe(true);
    expect(canAddSupportMessage("viewer", "open")).toBe(false);
    expect(canAddSupportMessage("member", "closed")).toBe(false);
    expect(canAddSupportMessage("administrator", "cancelled")).toBe(false);
  });

  it("gives lifecycle authority to owners, administrators, and the requester only", () => {
    expect(canCloseOrCancelSupportRequest("owner", false, "open")).toBe(true);
    expect(canCloseOrCancelSupportRequest("administrator", false, "open")).toBe(true);
    expect(canCloseOrCancelSupportRequest("member", true, "open")).toBe(true);
    expect(canCloseOrCancelSupportRequest("member", false, "open")).toBe(false);
    expect(canCloseOrCancelSupportRequest("viewer", true, "open")).toBe(false);
    expect(canCloseOrCancelSupportRequest("owner", true, "closed")).toBe(false);
    expect(canCloseOrCancelSupportRequest("administrator", true, "cancelled")).toBe(false);
  });
});
