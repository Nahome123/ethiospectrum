import { describe, expect, it } from "vitest";
import {
  parsePublicSupabaseEnv,
  requirePublicSupabaseEnv,
  SupabaseConfigurationError,
} from "@/lib/env/client";
import { parseServerSupabaseEnv, requireSupabaseAdminEnv } from "@/lib/env/server";

const configuredPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
};

describe("Supabase environment validation", () => {
  it("allows a credential-free marketing configuration", () => {
    expect(parsePublicSupabaseEnv({})).toBeUndefined();
  });

  it("rejects partial or invalid public Supabase configuration", () => {
    expect(() =>
      parsePublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: configuredPublicEnv.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow(SupabaseConfigurationError);
    expect(() =>
      parsePublicSupabaseEnv({ ...configuredPublicEnv, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }),
    ).toThrow(SupabaseConfigurationError);
  });

  it("does not expose secret values through public configuration", () => {
    const publicEnv = parsePublicSupabaseEnv({ ...configuredPublicEnv, SUPABASE_SECRET_KEY: "private-key" });
    expect(publicEnv).toEqual({
      url: configuredPublicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: "local-publishable-key",
    });
    expect(publicEnv).not.toHaveProperty("secretKey");
    expect(publicEnv).not.toHaveProperty("SUPABASE_SECRET_KEY");
  });

  it("accepts a secret key only in server configuration", () => {
    expect(parseServerSupabaseEnv({ ...configuredPublicEnv, SUPABASE_SECRET_KEY: "private-key" })).toEqual({
      url: configuredPublicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: "local-publishable-key",
      secretKey: "private-key",
    });
  });

  it("fails clearly when a configured operation is requested without credentials", () => {
    expect(() => requirePublicSupabaseEnv({})).toThrow(SupabaseConfigurationError);
    expect(() => requireSupabaseAdminEnv({})).toThrow(SupabaseConfigurationError);
  });
});
