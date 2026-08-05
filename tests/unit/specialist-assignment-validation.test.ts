import { describe, expect, it } from "vitest";
import {
  canAdministerAssignment,
  canAssignSpecialist,
  canRevokeSpecialist,
  canSpecialistRespond,
  isEligibleSpecialistAvailability,
  revocationReasonForStatus,
  specialistAssignmentActionValues,
  specialistRevocationReasonValues,
  supportMessageAuthorKindValues,
  SPECIALIST_MAX_ACTIVE_PER_REQUEST,
} from "@/lib/specialists/constants";
import {
  assignSpecialistSchema,
  createSpecialistMessageSchema,
  revokeSpecialistSchema,
  specialistExpectedAssignmentVersionSchema,
  specialistPageSchema,
  specialistRequestIdSchema,
  supportMessageAuthorKindSchema,
} from "@/lib/validation/specialists";

const requestId = "a4000000-0000-4000-8000-000000000001";
const specialistId = "a3000000-0000-4000-8000-000000000001";

describe("specialist assignment schemas", () => {
  it("accepts a valid assignment payload", () => {
    const result = assignSpecialistSchema.safeParse({
      specialistId,
      expectedAssignmentVersion: "0",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expectedAssignmentVersion).toBe(0);
  });

  it.each([
    ["non-uuid specialist", { specialistId: "not-a-uuid", expectedAssignmentVersion: "0" }],
    ["negative version", { specialistId, expectedAssignmentVersion: "-1" }],
    ["non-numeric version", { specialistId, expectedAssignmentVersion: "abc" }],
  ])("rejects %s", (_label, payload) => {
    expect(assignSpecialistSchema.safeParse(payload).success).toBe(false);
  });

  it("requires an expected version to revoke", () => {
    expect(revokeSpecialistSchema.safeParse({ expectedAssignmentVersion: "2" }).success).toBe(true);
    expect(revokeSpecialistSchema.safeParse({}).success).toBe(false);
  });

  it("allows assignment version zero because assignments start unassigned", () => {
    expect(specialistExpectedAssignmentVersionSchema.safeParse("0").success).toBe(true);
    expect(specialistExpectedAssignmentVersionSchema.safeParse("-1").success).toBe(false);
  });

  it("bounds specialist responses between 1 and 2,000 characters", () => {
    const schema = createSpecialistMessageSchema("response-error");
    const trimmed = schema.safeParse({ body: "  A specialist response.  " });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) expect(trimmed.data.body).toBe("A specialist response.");
    expect(schema.safeParse({ body: "   " }).success).toBe(false);
    expect(schema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
    const failure = schema.safeParse({ body: "" });
    if (!failure.success) {
      expect(failure.error.issues.map((issue) => issue.message)).toContain("response-error");
    }
  });

  it("validates identifiers, pagination, and author kinds", () => {
    expect(specialistRequestIdSchema.safeParse(requestId).success).toBe(true);
    expect(specialistRequestIdSchema.safeParse("nope").success).toBe(false);
    expect(specialistPageSchema.safeParse("3").success).toBe(true);
    expect(specialistPageSchema.safeParse("0").success).toBe(false);
    expect(supportMessageAuthorKindSchema.safeParse("specialist").success).toBe(true);
    expect(supportMessageAuthorKindSchema.safeParse("administrator").success).toBe(false);
    expect(supportMessageAuthorKindValues).toEqual(["caregiver", "specialist"]);
  });
});

describe("specialist assignment permission matrix", () => {
  it("permits assignment only for a platform administrator", () => {
    expect(canAdministerAssignment("administrator")).toBe(true);
    expect(canAdministerAssignment("specialist")).toBe(false);
    expect(canAdministerAssignment("content_editor")).toBe(false);
    expect(canAdministerAssignment("member")).toBe(false);
    expect(canAdministerAssignment(null)).toBe(false);
  });

  it("permits assignment only on an open, unassigned request", () => {
    expect(canAssignSpecialist("open", null)).toBe(true);
    expect(canAssignSpecialist("open", specialistId)).toBe(false);
    expect(canAssignSpecialist("closed", null)).toBe(false);
    expect(canAssignSpecialist("cancelled", null)).toBe(false);
  });

  it("permits revocation only on an open, assigned request", () => {
    expect(canRevokeSpecialist("open", specialistId)).toBe(true);
    expect(canRevokeSpecialist("open", null)).toBe(false);
    expect(canRevokeSpecialist("closed", specialistId)).toBe(false);
    expect(canRevokeSpecialist("cancelled", specialistId)).toBe(false);
  });

  it("permits responses only while actively assigned to an open request", () => {
    expect(canSpecialistRespond("open", true)).toBe(true);
    expect(canSpecialistRespond("open", false)).toBe(false);
    expect(canSpecialistRespond("closed", true)).toBe(false);
    expect(canSpecialistRespond("cancelled", true)).toBe(false);
  });

  it("treats only available specialists as eligible", () => {
    expect(isEligibleSpecialistAvailability("available")).toBe(true);
    expect(isEligibleSpecialistAvailability("unavailable")).toBe(false);
  });

  it("holds at most one active specialist per request", () => {
    expect(SPECIALIST_MAX_ACTIVE_PER_REQUEST).toBe(1);
  });
});

describe("specialist assignment lifecycle", () => {
  it("maps terminal request statuses to controlled revocation reasons", () => {
    expect(revocationReasonForStatus("closed")).toBe("request_closed");
    expect(revocationReasonForStatus("cancelled")).toBe("request_cancelled");
    expect(revocationReasonForStatus("open")).toBeNull();
  });

  it("supports only assigned and revoked actions with controlled reasons", () => {
    expect(specialistAssignmentActionValues).toEqual(["assigned", "revoked"]);
    expect(specialistAssignmentActionValues).not.toContain("reactivated");
    expect(specialistRevocationReasonValues).toEqual([
      "administrator_revoked",
      "request_closed",
      "request_cancelled",
    ]);
  });
});
