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

const optionalDocumentProcessingSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

export interface ServerSupabaseEnv extends PublicSupabaseEnv {
  secretKey?: string;
}

export interface SupabaseAdminEnv extends PublicSupabaseEnv {
  secretKey: string;
}

export function parseServerSupabaseEnv(input: EnvInput): ServerSupabaseEnv | undefined {
  const publicEnv = parsePublicSupabaseEnv(input);
  const secretKey = optionalServiceRoleKey.parse(input.SUPABASE_SECRET_KEY);

  if (!publicEnv) {
    if (secretKey) {
      throw new SupabaseConfigurationError(
        "SUPABASE_SECRET_KEY requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      );
    }
    return undefined;
  }

  return { ...publicEnv, secretKey };
}

export function getServerSupabaseEnv(input?: EnvInput): ServerSupabaseEnv | undefined {
  const publicEnv = getPublicSupabaseEnv(
    input ?? {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
  );
  const secretKey = optionalServiceRoleKey.parse(
    input?.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY,
  );

  if (!publicEnv) {
    if (secretKey) {
      throw new SupabaseConfigurationError(
        "SUPABASE_SECRET_KEY requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      );
    }
    return undefined;
  }

  return { ...publicEnv, secretKey };
}

export function requireServerSupabaseEnv(input?: EnvInput): ServerSupabaseEnv {
  const env = getServerSupabaseEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "Supabase is not configured for this development environment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before using Supabase features.",
    );
  }
  return env;
}

export function requireSupabaseAdminEnv(input?: EnvInput): SupabaseAdminEnv {
  const env = requireServerSupabaseEnv(input);
  if (!env.secretKey) {
    throw new SupabaseConfigurationError(
      "SUPABASE_SECRET_KEY is required for controlled server-side administrative Supabase operations.",
    );
  }
  return { ...env, secretKey: env.secretKey };
}

/** Separate internal-invocation secret; never reuse the Supabase service key. */
export function getDocumentProcessingSecret(input?: EnvInput): string | undefined {
  return optionalDocumentProcessingSecret.parse(
    input?.DOCUMENT_PROCESSING_SECRET ?? process.env.DOCUMENT_PROCESSING_SECRET,
  );
}

export function requireDocumentProcessingSecret(input?: EnvInput): string {
  const secret = getDocumentProcessingSecret(input);
  if (!secret) {
    throw new SupabaseConfigurationError(
      "DOCUMENT_PROCESSING_SECRET is required for controlled document-processing invocation.",
    );
  }
  return secret;
}
