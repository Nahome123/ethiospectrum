import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getDocumentContext: vi.fn(),
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("@/lib/documents/server", () => ({ getDocumentContext: mocks.getDocumentContext }));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  evaluateDocumentSummaryAction,
  submitDocumentSummaryReviewAction,
} from "@/lib/documents/summary-quality-actions";

const documentId = "30000000-0000-4000-8000-000000000003";
const idle = { status: "idle" } as const;

function context(permission: "owner" | "member" | "viewer" = "member") {
  const canProcess = permission !== "viewer";
  return {
    household: { id: "10000000-0000-4000-8000-000000000001", name: "Synthetic household" },
    userId: "20000000-0000-4000-8000-000000000002",
    permission,
    canUpload: canProcess,
    canProcess,
  };
}

function reviewForm(decision = "") {
  const form = new FormData();
  form.set("overallRating", "5");
  form.set("accuracyRating", "4");
  form.set("completenessRating", "4");
  form.set("citationRating", "5");
  form.set("languageRating", "4");
  form.set("issueCategories", "citation_missing");
  form.set("feedback", "Synthetic feedback");
  form.set("decision", decision);
  return form;
}

describe("document summary quality actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getDocumentContext.mockResolvedValue(context());
  });

  it("rejects invalid route input before loading a trusted session", async () => {
    await expect(
      evaluateDocumentSummaryAction("en", "not-a-uuid", "en", idle, new FormData()),
    ).resolves.toEqual({
      status: "error",
      message: "summaryQualityUnavailable",
    });
    expect(mocks.getDocumentContext).not.toHaveBeenCalled();
  });

  it("denies a viewer before calling quality or review RPCs", async () => {
    mocks.getDocumentContext.mockResolvedValue(context("viewer"));
    await expect(
      evaluateDocumentSummaryAction("en", documentId, "en", idle, new FormData()),
    ).resolves.toEqual({
      status: "error",
      message: "summaryQualityAccessDenied",
    });
    await expect(
      submitDocumentSummaryReviewAction("en", documentId, "en", idle, reviewForm()),
    ).resolves.toEqual({
      status: "error",
      message: "summaryReviewAccessDenied",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("uses trusted route values and never submits reviewer, household, or role fields", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });

    await expect(
      evaluateDocumentSummaryAction("es", documentId, "es", idle, new FormData()),
    ).resolves.toEqual({
      status: "success",
      message: "summaryQualityCompleted",
    });
    await expect(
      submitDocumentSummaryReviewAction("es", documentId, "es", idle, reviewForm()),
    ).resolves.toEqual({
      status: "success",
      message: "summaryReviewSaved",
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "evaluate_document_summary", {
      target_document_id: documentId,
      requested_language: "es",
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "upsert_document_summary_review",
      expect.objectContaining({ target_document_id: documentId, requested_language: "es" }),
    );
    const reviewArgs = rpc.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(reviewArgs).not.toHaveProperty("reviewed_by");
    expect(reviewArgs).not.toHaveProperty("household_id");
    expect(reviewArgs).not.toHaveProperty("role");
  });

  it("does not let a member submit an approval decision", async () => {
    await expect(
      submitDocumentSummaryReviewAction("en", documentId, "en", idle, reviewForm("approved")),
    ).resolves.toEqual({
      status: "error",
      message: "summaryReviewDecisionDenied",
    });
  });
});
