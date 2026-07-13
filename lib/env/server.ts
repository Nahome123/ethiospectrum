import "server-only";
import { z } from "zod";
import {
  getPublicSupabaseEnv,
  parsePublicSupabaseEnv,
  type PublicSupabaseEnv,
  SupabaseConfigurationError,
} from "./client";

type EnvInput = Record<string, string | undefined>;

const optionalServiceRoleKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

export interface ServerSupabaseEnv extends PublicSupabaseEnv {
  serviceRoleKey?: string;
}

export interface SupabaseAdminEnv extends PublicSupabaseEnv {
  serviceRoleKey: string;
}

export function parseServerSupabaseEnv(input: EnvInput): ServerSupabaseEnv | undefined {
  const publicEnv = parsePublicSupabaseEnv(input);
  const serviceRoleKey = optionalServiceRoleKey.parse(input.SUPABASE_SERVICE_ROLE_KEY);

  if (!publicEnv) {
    if (serviceRoleKey) {
      throw new SupabaseConfigurationError(
        "SUPABASE_SERVICE_ROLE_KEY requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    return undefined;
  }

  return { ...publicEnv, serviceRoleKey };
}

export function getServerSupabaseEnv(input?: EnvInput): ServerSupabaseEnv | undefined {
  const publicEnv = getPublicSupabaseEnv(
    input ?? {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  );
  const serviceRoleKey = optionalServiceRoleKey.parse(
    input?.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (!publicEnv) {
    if (serviceRoleKey) {
      throw new SupabaseConfigurationError(
        "SUPABASE_SERVICE_ROLE_KEY requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
    }
    return undefined;
  }

  return { ...publicEnv, serviceRoleKey };
}

export function requireServerSupabaseEnv(input?: EnvInput): ServerSupabaseEnv {
  const env = getServerSupabaseEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "Supabase is not configured for this development environment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before using Supabase features.",
    );
  }
  return env;
}

export function requireSupabaseAdminEnv(input?: EnvInput): SupabaseAdminEnv {
  const env = requireServerSupabaseEnv(input);
  if (!env.serviceRoleKey) {
    throw new SupabaseConfigurationError(
      "SUPABASE_SERVICE_ROLE_KEY is required for controlled server-side administrative Supabase operations.",
    );
  }
  return { ...env, serviceRoleKey: env.serviceRoleKey };
}
