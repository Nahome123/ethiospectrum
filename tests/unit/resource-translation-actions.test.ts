import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getTranslations: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server-action", () => ({
  createServerActionSupabaseClient: mocks.createServerActionSupabaseClient,
}));
vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  approveResourceTranslation,
  createResourceTranslation,
  rejectResourceTranslation,
  submitResourceTranslation,
  updateResourceTranslation,
  withdrawResourceTranslation,
} from "@/lib/resources/translation-actions";

const resourceId = "10000000-0000-4000-8000-000000000001";
const translationId = "20000000-0000-4000-8000-000000000002";
const actorId = "30000000-0000-4000-8000-000000000003";
const idle = { status: "idle" } as const;
const editorPaths = [
  `/en/editor/resources/${resourceId}/translations`,
  `/en/editor/resources/${resourceId}/translations/am`,
  `/en/editor/resources/${resourceId}/translations/am/edit`,
  `/en/editor/resources/${resourceId}/translations/am/review`,
];

function createForm(locale: string = "am") {
  const form = new FormData();
  form.set("resourceId", resourceId);
  form.set("translationLocale", locale);
  form.set("title", locale === "es" ? "Guía familiar" : "የቤተሰብ መመሪያ");
  form.set("summary", "This is a sufficiently detailed translated summary.");
  form.set(
    "body",
    "This translated body is deliberately long enough to satisfy the required validation boundary.",
  );
  return form;
}

function updateForm() {
  const form = createForm();
  form.set("translationId", translationId);
  form.set("expectedVersion", "7");
  return form;
}

function transitionForm() {
  const form = new FormData();
  form.set("translationId", translationId);
  form.set("expectedVersion", "7");
  return form;
}

function rejectionForm(note = "  The terminology needs revision.  ") {
  const form = transitionForm();
  form.set("rejectionNote", note);
  return form;
}

type RpcError = { code?: string; message?: string } | null;

function rpcResult(error: RpcError = null) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error });
  mocks.createServerActionSupabaseClient.mockResolvedValue({ rpc });
  return rpc;
}

function allActionCalls() {
  return [
    () => createResourceTranslation("en", idle, createForm()),
    () => updateResourceTranslation("en", resourceId, "am", idle, updateForm()),
    () => submitResourceTranslation("en", resourceId, "am", idle, transitionForm()),
    () => withdrawResourceTranslation("en", resourceId, "am", idle, transitionForm()),
    () => approveResourceTranslation("en", resourceId, "am", idle, transitionForm()),
    () => rejectResourceTranslation("en", resourceId, "am", idle, rejectionForm()),
  ];
}

describe("resource translation action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: actorId, role: "content_editor" });
    rpcResult();
  });

  it.each([
    ["unauthenticated", null],
    ["ordinary reader", { id: actorId, role: "member" }],
    ["role without global access", { id: actorId, role: null }],
  ])("denies %s access to every translation action", async (_label, user) => {
    mocks.getAuthenticatedUser.mockResolvedValue(user);
    for (const call of allActionCalls()) {
      await expect(call()).resolves.toEqual({ status: "error", message: "validationError" });
    }
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(["owner", "administrator", "member", "viewer"])(
    "does not trust a browser-provided household %s role",
    async (householdRole) => {
      mocks.getAuthenticatedUser.mockResolvedValue({ id: actorId, role: "member" });
      const form = createForm();
      form.set("householdRole", householdRole);
      form.set("role", "content_editor");
      await expect(createResourceTranslation("en", idle, form)).resolves.toEqual({
        status: "error",
        message: "validationError",
      });
      expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
    },
  );

  it.each(["content_editor", "administrator"])("allows the global %s role for all actions", async (role) => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: actorId, role });
    for (const call of allActionCalls()) {
      await expect(call()).resolves.toEqual({ status: "success", message: "saved" });
    }
    expect(mocks.createServerActionSupabaseClient).toHaveBeenCalledTimes(6);
  });
});

describe("resource translation create and update actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: actorId, role: "content_editor" });
  });

  it.each(["am", "es"] as const)("creates a %s draft through the controlled RPC", async (locale) => {
    const rpc = rpcResult();
    const form = createForm(locale);
    form.set("actorUserId", "browser-actor");
    form.set("sourceTranslationVersion", "999");
    form.set("reviewStatus", "approved");

    await expect(createResourceTranslation("en", idle, form)).resolves.toEqual({
      status: "success",
      message: "saved",
    });
    expect(rpc).toHaveBeenCalledWith("create_resource_translation_draft", {
      target_resource_id: resourceId,
      input_locale: locale,
      input_title: locale === "es" ? "Guía familiar" : "የቤተሰብ መመሪያ",
      input_summary: "This is a sufficiently detailed translated summary.",
      input_body:
        "This translated body is deliberately long enough to satisfy the required validation boundary.",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("browser-actor");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("999");
  });

  it.each(["en", "fr", "de", "", "  "])(
    "rejects the %j create locale before database access",
    async (locale) => {
      await expect(createResourceTranslation("en", idle, createForm(locale))).resolves.toEqual({
        status: "error",
        message: "validationError",
      });
      expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
    },
  );

  it("passes the expected version and content to the update RPC without privileged browser fields", async () => {
    const rpc = rpcResult();
    const form = updateForm();
    form.set("resourceId", "browser-resource");
    form.set("translationLocale", "es");
    form.set("reviewerUserId", "browser-reviewer");
    form.set("reviewStatus", "approved");
    form.set("sourceTranslationVersion", "999");

    await expect(updateResourceTranslation("en", resourceId, "am", idle, form)).resolves.toEqual({
      status: "success",
      message: "saved",
    });
    expect(rpc).toHaveBeenCalledWith("update_resource_translation_draft", {
      target_translation_id: translationId,
      expected_version: 7,
      input_title: "የቤተሰብ መመሪያ",
      input_summary: "This is a sufficiently detailed translated summary.",
      input_body:
        "This translated body is deliberately long enough to satisfy the required validation boundary.",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("browser-reviewer");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("browser-resource");
  });

  it("requires the update concurrency version before database access", async () => {
    const form = updateForm();
    form.delete("expectedVersion");
    await expect(updateResourceTranslation("en", resourceId, "am", idle, form)).resolves.toEqual({
      status: "error",
      message: "validationError",
    });
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate translation", { code: "23505", message: "duplicate key value violates unique constraint" }],
    ["archived parent", { code: "42501", message: "Resource is unavailable." }],
    ["missing parent", { code: "42501", message: "Resource access is unavailable." }],
    ["missing English source", { code: "22023", message: "Canonical English content is unavailable." }],
    ["unapproved English source", { code: "22023", message: "Canonical English content is unavailable." }],
    ["invalid transition", { code: "22023", message: "Translation transition is invalid." }],
  ])("maps %s to a safe create/update error", async (_label, error) => {
    rpcResult(error);
    const result = await createResourceTranslation("en", idle, createForm());
    expect(result).toEqual({ status: "error", message: "translationActionError" });
    expect(JSON.stringify(result)).not.toContain(error.message);
  });
});

describe("resource translation transition actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: actorId, role: "content_editor" });
  });

  it.each([
    ["submit_resource_translation", submitResourceTranslation],
    ["withdraw_resource_translation", withdrawResourceTranslation],
    ["approve_resource_translation", approveResourceTranslation],
  ] as const)("calls %s with only controlled identifiers and concurrency input", async (rpcName, action) => {
    const rpc = rpcResult();
    const form = transitionForm();
    form.set("actorUserId", "browser-actor");
    form.set("submitterUserId", "browser-submitter");
    form.set("reviewerUserId", "browser-reviewer");
    form.set("reviewStatus", "approved");
    form.set("sourceTranslationVersion", "999");
    form.set("body", "invalid");

    await expect(action("en", resourceId, "am", idle, form)).resolves.toEqual({
      status: "success",
      message: "saved",
    });
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      target_translation_id: translationId,
      expected_version: 7,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("browser-");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("999");
  });

  it("trims a valid rejection note and excludes forged reviewer state", async () => {
    const rpc = rpcResult();
    const form = rejectionForm();
    form.set("reviewerUserId", "browser-reviewer");
    form.set("reviewStatus", "approved");

    await expect(rejectResourceTranslation("en", resourceId, "am", idle, form)).resolves.toEqual({
      status: "success",
      message: "saved",
    });
    expect(rpc).toHaveBeenCalledWith("reject_resource_translation", {
      target_translation_id: translationId,
      expected_version: 7,
      input_rejection_note: "The terminology needs revision.",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("browser-reviewer");
  });

  it.each([undefined, "", "short", "          ", "x".repeat(1_001)])(
    "rejects an invalid rejection note before database access",
    async (note) => {
      const form = rejectionForm(note ?? "");
      if (note === undefined) form.delete("rejectionNote");
      await expect(rejectResourceTranslation("en", resourceId, "am", idle, form)).resolves.toEqual({
        status: "error",
        message: "validationError",
      });
      expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
    },
  );

  it("requires an optimistic-concurrency version for submit, withdraw, approve, and reject", async () => {
    const calls = [
      () => submitResourceTranslation("en", resourceId, "am", idle, new FormData()),
      () => withdrawResourceTranslation("en", resourceId, "am", idle, new FormData()),
      () => approveResourceTranslation("en", resourceId, "am", idle, new FormData()),
      () => rejectResourceTranslation("en", resourceId, "am", idle, new FormData()),
    ];
    for (const call of calls) {
      await expect(call()).resolves.toEqual({ status: "error", message: "validationError" });
    }
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([
    ["stale translation", { code: "40001", message: "Translation is stale." }, "translationUpdatedElsewhere"],
    ["changed English source", { code: "40001", message: "English source changed." }, "englishSourceChanged"],
    ["self review", { code: "42501", message: "Translation review is unavailable." }, "selfReviewError"],
    ["archived parent", { code: "42501", message: "Resource is unavailable." }, "translationActionError"],
    [
      "missing translation",
      { code: "42501", message: "Translation is unavailable." },
      "translationActionError",
    ],
    [
      "invalid transition",
      { code: "22023", message: "Translation transition is invalid." },
      "translationActionError",
    ],
    [
      "unexpected database failure",
      { code: "XX000", message: "private.table internal failure" },
      "translationActionError",
    ],
  ])("maps %s without exposing database details", async (_label, error, expectedMessage) => {
    rpcResult(error);
    const result = await approveResourceTranslation("en", resourceId, "am", idle, transitionForm());
    expect(result).toEqual({ status: "error", message: expectedMessage });
    const visible = JSON.stringify(result);
    expect(visible).not.toContain(error.code);
    expect(visible).not.toContain(error.message);
    expect(visible).not.toContain(resourceId);
    expect(visible).not.toContain(translationId);
  });
});

describe("resource translation route revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getAuthenticatedUser.mockResolvedValue({ id: actorId, role: "content_editor" });
    rpcResult();
  });

  it("revalidates editor routes after create, update, submit, withdraw, and reject without public routes", async () => {
    const calls = [
      () => createResourceTranslation("en", idle, createForm()),
      () => updateResourceTranslation("en", resourceId, "am", idle, updateForm()),
      () => submitResourceTranslation("en", resourceId, "am", idle, transitionForm()),
      () => withdrawResourceTranslation("en", resourceId, "am", idle, transitionForm()),
      () => rejectResourceTranslation("en", resourceId, "am", idle, rejectionForm()),
    ];
    for (const call of calls) {
      mocks.revalidatePath.mockClear();
      await call();
      expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual(editorPaths);
      expect(mocks.revalidatePath.mock.calls.flat().join(" ")).not.toContain("/resources/[slug]");
      expect(mocks.revalidatePath.mock.calls.flat().join(" ")).not.toContain("household");
    }
  });

  it.each(["am", "es"] as const)("revalidates only %s public content after approval", async (locale) => {
    await approveResourceTranslation("en", resourceId, locale, idle, transitionForm());
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toEqual([
      `/en/editor/resources/${resourceId}/translations`,
      `/en/editor/resources/${resourceId}/translations/${locale}`,
      `/en/editor/resources/${resourceId}/translations/${locale}/edit`,
      `/en/editor/resources/${resourceId}/translations/${locale}/review`,
      `/${locale}/resources`,
      `/${locale}/resources/[slug]`,
    ]);
    expect(mocks.revalidatePath).toHaveBeenLastCalledWith(`/${locale}/resources/[slug]`, "page");
    expect(paths.join(" ")).not.toContain("household");
    expect(paths.every((path) => !path.includes(`/${locale}/${locale}/`))).toBe(true);
  });
});
