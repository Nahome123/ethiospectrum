import { describe, expect, it } from "vitest";
import {
  parsePublicSupabaseEnv,
  requirePublicSupabaseEnv,
  SupabaseConfigurationError,
} from "@/lib/env/client";
import { parseServerSupabaseEnv, requireSupabaseAdminEnv } from "@/lib/env/server";

const configuredPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
};

describe("Supabase environment validation", () => {
  it("allows a credential-free marketing configuration", () => {
    expect(parsePublicSupabaseEnv({})).toBeUndefined();
  });

  it("rejects partial public Supabase configuration", () => {
    expect(() =>
      parsePublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: configuredPublicEnv.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow(SupabaseConfigurationError);
  });

  it("rejects invalid public Supabase URLs", () => {
    expect(() =>
      parsePublicSupabaseEnv({ ...configuredPublicEnv, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }),
    ).toThrow(SupabaseConfigurationError);
  });

  it("does not expose service-role values through the public configuration", () => {
    const publicEnv = parsePublicSupabaseEnv({
      ...configuredPublicEnv,
      SUPABASE_SERVICE_ROLE_KEY: "private-key",
    });

    expect(publicEnv).toEqual({
      url: configuredPublicEnv.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: "local-anon-key",
    });
    expect(publicEnv).not.toHaveProperty("serviceRoleKey");
    expect(publicEnv).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("accepts a service role key only in the server configuration", () => {
    expect(
      parseServerSupabaseEnv({ ...configuredPublicEnv, SUPABASE_SERVICE_ROLE_KEY: "private-key" }),
    ).toEqual({
      url: configuredPublicEnv.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: "local-anon-key",
      serviceRoleKey: "private-key",
    });
  });

  it("fails clearly when a Supabase operation is requested without configuration", () => {
    expect(() => requirePublicSupabaseEnv({})).toThrow(SupabaseConfigurationError);
    expect(() => requireSupabaseAdminEnv({})).toThrow(SupabaseConfigurationError);
  });
});
