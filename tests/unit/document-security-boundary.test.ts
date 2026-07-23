import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(file), "utf8");

describe("document upload application boundaries", () => {
  it("keeps the server-actions module limited to exported async functions", () => {
    const actions = source("lib/documents/actions.ts");
    const exportedDeclarations = [...actions.matchAll(/^export\s+(.+)$/gm)].map((match) => match[1]);

    expect(actions.trimStart().startsWith('"use server";')).toBe(true);
    expect(exportedDeclarations.length).toBeGreaterThan(0);
    for (const declaration of exportedDeclarations) {
      expect(declaration).toMatch(/^async function [A-Za-z_$][\w$]*\(/);
    }
    expect(actions).not.toContain("export const");
    expect(actions).not.toContain("export type");
    expect(actions).not.toContain("export *");
  });

  it("keeps action state neutral and imports it from the client components", () => {
    const actionState = source("lib/documents/action-state.ts");
    const uploadForm = source("components/documents/upload-form.tsx");
    const archiveButton = source("components/documents/archive-document-button.tsx");

    expect(actionState).not.toContain('"use server"');
    expect(actionState).toContain("initialDocumentActionState");
    expect(uploadForm).toContain('from "@/lib/documents/action-state"');
    expect(archiveButton).toContain('from "@/lib/documents/action-state"');
    expect(uploadForm).not.toContain('initialDocumentActionState } from "@/lib/documents/actions"');
    expect(archiveButton).not.toContain('initialDocumentActionState } from "@/lib/documents/actions"');
  });

  it("uses a signed, non-upsert browser upload flow without an elevated client", () => {
    const actions = source("lib/documents/actions.ts");
    const uploadForm = source("components/documents/upload-form.tsx");
    const documentServer = source("lib/documents/server.ts");

    expect(actions).toContain("createSignedUploadUrl");
    expect(actions).toContain("{ upsert: false }");
    expect(actions).toContain(".info(");
    expect(actions).toContain("objectMatchesExpectedMetadata");
    expect(uploadForm).toContain("uploadToSignedUrl");
    expect(uploadForm).not.toContain("createSignedUploadUrl");
    expect(uploadForm).not.toContain("getPublicUrl");

    for (const sourceModule of [actions, documentServer, uploadForm]) {
      expect(sourceModule).not.toContain("lib/supabase/admin");
      expect(sourceModule).not.toContain("SUPABASE_SECRET_KEY");
    }
  });

  it("issues downloads only for a visible active uploaded document through a short-lived signed URL", () => {
    const route = source("app/api/documents/[documentId]/download/route.ts");

    expect(route).toContain("documentIdSchema");
    expect(route).toContain("getDocumentContext");
    expect(route).toContain('.eq("household_id", context.household.id)');
    expect(route).toContain('.eq("upload_status", "uploaded")');
    expect(route).toContain('.is("deleted_at", null)');
    expect(route).toContain("createSignedUrl(document.storage_path, 60");
    expect(route).toContain("NextResponse.redirect");
    expect(route).not.toContain("getPublicUrl");
    expect(route).not.toContain("lib/supabase/admin");
  });

  it("counts and previews only active uploaded documents on the dashboard", () => {
    const dashboard = source("app/[locale]/(member)/dashboard/page.tsx");

    expect(dashboard).toContain('.eq("upload_status", "uploaded")');
    expect(dashboard).toContain('.is("deleted_at", null)');
    expect(dashboard).toContain("documentCount");
    expect(dashboard).toContain("recentDocuments");
  });

  it("derives document authorization from active household membership on the server", () => {
    const documentServer = source("lib/documents/server.ts");

    expect(documentServer).toContain('import "server-only"');
    expect(documentServer).toContain("getCurrentSupabaseClaims");
    expect(documentServer).toContain("getCurrentHousehold");
    expect(documentServer).toContain('.eq("status", "active")');
    expect(documentServer).toContain('"owner", "administrator", "member"');
    expect(documentServer).not.toContain("lib/supabase/admin");
  });
});
