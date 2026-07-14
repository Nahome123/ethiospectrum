import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : pnpm;
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm.cmd exec supabase gen types typescript --local"]
    : ["exec", "supabase", "gen", "types", "typescript", "--local"];
const result = spawnSync(command, args, { encoding: "utf8" });

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "Supabase type generation failed.\n");
  process.exit(result.status ?? 1);
}

const types = result.stdout.replace(/^Connecting to db \d+\r?\n/, "");
if (!types.startsWith("export type Json")) {
  throw new Error("Supabase type generation did not produce a TypeScript schema contract.");
}

writeFileSync(fileURLToPath(new URL("../lib/supabase/database.types.ts", import.meta.url)), types);
