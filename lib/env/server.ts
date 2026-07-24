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

const optionalOpenAiApiKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalOpenAiSummaryModel = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
);

const optionalDocumentSummarySecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

export interface ServerSupabaseEnv extends PublicSupabaseEnv {
  secretKey?: string;
}

export interface SupabaseAdminEnv extends PublicSupabaseEnv {
  secretKey: string;
}

export interface OpenAiSummaryEnv {
  apiKey: string;
  model: string;
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

/** Server-only provider configuration for bounded document summaries. */
export function getOpenAiSummaryEnv(input?: EnvInput): OpenAiSummaryEnv | undefined {
  const apiKey = optionalOpenAiApiKey.parse(input?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY);
  const model = optionalOpenAiSummaryModel.parse(
    input?.OPENAI_SUMMARY_MODEL ?? process.env.OPENAI_SUMMARY_MODEL,
  );

  if (!apiKey && !model) return undefined;
  if (!apiKey || !model) {
    throw new SupabaseConfigurationError(
      "OPENAI_API_KEY and OPENAI_SUMMARY_MODEL must be configured together for document summaries.",
    );
  }
  return { apiKey, model };
}

export function requireOpenAiSummaryEnv(input?: EnvInput): OpenAiSummaryEnv {
  const env = getOpenAiSummaryEnv(input);
  if (!env) {
    throw new SupabaseConfigurationError(
      "OPENAI_API_KEY and OPENAI_SUMMARY_MODEL are required for controlled document summaries.",
    );
  }
  return env;
}

/** Separate internal-invocation secret; never reuse processing or Supabase secrets. */
export function getDocumentSummarySecret(input?: EnvInput): string | undefined {
  return optionalDocumentSummarySecret.parse(
    input?.DOCUMENT_SUMMARY_SECRET ?? process.env.DOCUMENT_SUMMARY_SECRET,
  );
}

export function requireDocumentSummarySecret(input?: EnvInput): string {
  const secret = getDocumentSummarySecret(input);
  if (!secret) {
    throw new SupabaseConfigurationError(
      "DOCUMENT_SUMMARY_SECRET is required for controlled document-summary invocation.",
    );
  }
  return secret;
}
