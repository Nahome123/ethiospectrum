import { beforeEach, describe, expect, it } from "vitest";
import { deleteMember, MemberDeletionError, type MemberDeletionPreview } from "@/lib/admin/member-deletion";

const calls: string[] = [];

function adminClient(
  options: { auditError?: boolean; storageError?: boolean; deleteError?: boolean; remains?: boolean } = {},
) {
  return {
    from: (table: string) => ({
      insert: async () => {
        calls.push(`insert:${table}`);
        return { error: options.auditError ? { message: "no" } : null };
      },
      select: () => ({
        eq: async () => ({ count: options.remains ? 1 : 0 }),
      }),
    }),
    storage: {
      from: () => ({
        list: async (folder: string) => ({
          data: folder.endsWith("/dependents")
            ? [{ id: "f1", name: "report.pdf" }]
            : folder.split("/").length === 2
              ? [{ id: null, name: "dependents" }]
              : [],
          error: null,
        }),
        remove: async (paths: string[]) => {
          calls.push(`storage.remove:${paths.join(",")}`);
          return { error: options.storageError ? { message: "no" } : null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async () => {
          calls.push("auth.deleteUser");
          return { error: options.deleteError ? { status: 500, message: "no" } : null };
        },
        getUserById: async () => ({ data: { user: options.remains ? { id: "u" } : null } }),
      },
    },
  };
}

function stripeClient(options: { fail?: boolean } = {}) {
  return {
    subscriptions: {
      list: async () => {
        if (options.fail) throw Object.assign(new Error("down"), { code: "api_error" });
        return {
          data: [
            { id: "sub_live", status: "active" },
            { id: "sub_old", status: "canceled" },
          ],
        };
      },
      cancel: async (id: string) => {
        calls.push(`stripe.cancel:${id}`);
      },
    },
    customers: {
      del: async (id: string) => {
        calls.push(`stripe.delete:${id}`);
      },
    },
  };
}

const owner: MemberDeletionPreview = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  displayName: "Owner",
  role: "member",
  memberOf: [],
  ownedHousehold: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Owner household",
    dependents: 1,
    requests: 2,
    payments: 1,
    openRefunds: 0,
    documents: 1,
    files: 1,
    caregivers: 0,
    stripeCustomerId: "cus_TEST123",
    subscriptionStatus: "active",
  },
};

async function run(
  admin: ReturnType<typeof adminClient>,
  stripe: ReturnType<typeof stripeClient> | null,
  preview = owner,
) {
  return deleteMember({
    actorId: "admin-id",
    admin: admin as never,
    preview,
    reason: "Member requested deletion",
    stripe: stripe as never,
  });
}

describe("deleting a member", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("audits, stops billing, removes files, then deletes the account", async () => {
    await run(adminClient(), stripeClient());
    expect(calls).toEqual([
      "insert:audit_logs",
      "stripe.cancel:sub_live",
      "stripe.delete:cus_TEST123",
      "storage.remove:households/22222222-2222-4222-8222-222222222222/dependents/report.pdf",
      "auth.deleteUser",
    ]);
  });

  it("deletes nothing when Stripe cannot be updated", async () => {
    await expect(run(adminClient(), stripeClient({ fail: true }))).rejects.toMatchObject({ step: "stripe" });
    expect(calls).toEqual(["insert:audit_logs"]);
  });

  it("refuses to delete a household with a Stripe customer when Stripe is not configured", async () => {
    await expect(run(adminClient(), null)).rejects.toBeInstanceOf(MemberDeletionError);
    expect(calls).not.toContain("auth.deleteUser");
  });

  it("keeps the account when stored files cannot be removed", async () => {
    await expect(run(adminClient({ storageError: true }), stripeClient())).rejects.toMatchObject({
      step: "storage",
    });
    expect(calls).not.toContain("auth.deleteUser");
  });

  it("reports when data remains after deletion", async () => {
    await expect(run(adminClient({ remains: true }), stripeClient())).rejects.toMatchObject({
      step: "verify",
    });
  });

  it("skips billing and files for someone who owns no household", async () => {
    await run(adminClient(), stripeClient(), { ...owner, ownedHousehold: null, role: "specialist" });
    expect(calls).toEqual(["insert:audit_logs", "auth.deleteUser"]);
  });
});
