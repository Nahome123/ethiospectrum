import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

const localSupabaseUrl = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i;

function readStatusValue(output: string, name: string) {
  const line = output.split(/\r?\n/).find((candidate) => candidate.startsWith(`${name}=`));
  if (!line) return undefined;
  const value = line.slice(name.length + 1).trim();
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function getLocalSupabaseEnvironment() {
  let output: string;
  try {
    const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
    const argumentsForPlatform =
      process.platform === "win32"
        ? ["/d", "/s", "/c", "pnpm exec supabase status -o env"]
        : ["exec", "supabase", "status", "-o", "env"];
    output = execFileSync(command, argumentsForPlatform, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "Local Supabase is unavailable. Start the local stack before running document E2E tests.",
    );
  }

  const url = readStatusValue(output, "API_URL");
  const publishableKey = readStatusValue(output, "PUBLISHABLE_KEY");
  const secretKey = readStatusValue(output, "SECRET_KEY");
  if (!url || !publishableKey || !secretKey || !localSupabaseUrl.test(url)) {
    throw new Error("Refusing to run document E2E tests without a local Supabase API target.");
  }

  return {
    E2E_DOCUMENTS_LOCAL_CONFIG: "1",
    E2E_LOCAL_SUPABASE: "1",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SECRET_KEY: secretKey,
  };
}

const localEnvironment = getLocalSupabaseEnvironment();
Object.assign(process.env, localEnvironment);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "documents.local.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: { baseURL: "http://127.0.0.1:3101", trace: "on-first-retry" },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --port 3101",
    env: { ...process.env, ...localEnvironment },
    reuseExistingServer: false,
    url: "http://127.0.0.1:3101",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
