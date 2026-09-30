import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  membership: vi.fn(),
  claims: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    order: () => mocks.membership(),
  };
  return {
    createServerComponentSupabaseClient: vi.fn(async () => ({
      rpc: mocks.rpc,
      from: () => query,
    })),
    getCurrentHousehold: vi.fn(),
    getCurrentSupabaseClaims: mocks.claims,
  };
});

import { getHouseholdAccess, HouseholdAccessError } from "@/lib/households/server";

const household = { id: "8d9586ca-2a9a-49ce-a23e-547649e492a1", name: "0.2test" };

describe("getHouseholdAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.claims.mockResolvedValue({ sub: "dcf72900-1d91-42cd-9287-e6ad91b26b7a" });
  });

  it("uses the RPC projection when it is available", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          household_id: household.id,
          household_name: household.name,
          permission: "member",
          is_owner: false,
          caregiver_permissions: ["submit_requests"],
        },
      ],
      error: null,
    });
    await expect(getHouseholdAccess()).resolves.toEqual({
      household,
      permission: "member",
      isOwner: false,
      permissions: ["submit_requests"],
    });
    expect(mocks.membership).not.toHaveBeenCalled();
  });

  it("reads the membership directly when the RPC is missing from the database", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    mocks.membership.mockResolvedValue({
      data: [{ permission: "owner", households: { ...household, deleted_at: null, created_at: "2026-09-29" } }],
      error: null,
    });
    const access = await getHouseholdAccess();
    expect(access?.household).toEqual(household);
    expect(access?.isOwner).toBe(true);
    expect(access?.permissions).toContain("make_payments");
  });

  it("gives a caregiver no launch permissions in the fallback", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    mocks.membership.mockResolvedValue({
      data: [{ permission: "member", households: { ...household, deleted_at: null, created_at: "2026-09-29" } }],
      error: null,
    });
    await expect(getHouseholdAccess()).resolves.toMatchObject({ isOwner: false, permissions: [] });
  });

  it("returns null only when neither source finds a membership", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    mocks.membership.mockResolvedValue({ data: [], error: null });
    await expect(getHouseholdAccess()).resolves.toBeNull();
  });

  it("throws instead of reporting no household when both lookups fail", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } });
    mocks.membership.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    await expect(getHouseholdAccess()).rejects.toBeInstanceOf(HouseholdAccessError);
  });
});
