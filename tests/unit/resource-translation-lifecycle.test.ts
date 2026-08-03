import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260731000006_resource_translation_workflow.sql"),
  "utf8",
);

function functionBody(schema: "private" | "public", name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(
    new RegExp(`create or replace function ${schema}\\.${escapedName}\\([^]*?\\$\\$;`, "i"),
  );
  if (!match) throw new Error(`Missing production database function: ${schema}.${name}`);
  return match[0].replace(/\s+/g, " ").toLowerCase();
}

describe("resource translation controlled lifecycle", () => {
  it("authorizes only global editors and excludes household membership", () => {
    const authorization = functionBody("private", "can_manage_resources");
    expect(authorization).toContain("'administrator'::public.app_role");
    expect(authorization).toContain("'content_editor'::public.app_role");
    expect(authorization).not.toContain("household");
    expect(authorization).not.toContain("owner");
    expect(authorization).not.toContain("viewer");
  });

  it("requires an authenticated actor, an active parent, and approved canonical English", () => {
    const context = functionBody("private", "require_translation_context");
    expect(context).toContain("auth.uid() is null");
    expect(context).toContain("current_resource.status='archived'");
    expect(context).toContain("current_resource.archived_at is not null");
    expect(context).toContain("current_english.review_status<>'approved'");
    expect(context).toContain("current_resource.status not in ('in_review','published')");
    expect(context).toContain("return current_english.version");
  });

  it("creates only Amharic or Spanish drafts with server-derived actor and source version", () => {
    const create = functionBody("public", "create_resource_translation_draft");
    expect(create).toContain("input_locale not in ('am','es')");
    expect(create).toContain("declare actor uuid := auth.uid()");
    expect(create).toContain("english_version:=private.require_translation_context(target_resource_id)");
    expect(create).toContain("'draft',english_version,actor,actor");
    expect(create).not.toContain("input_actor");
    expect(create).not.toContain("input_source");
    expect(create).not.toContain("slug");
  });

  it("updates only drafts at the expected version and refreshes the source version", () => {
    const update = functionBody("public", "update_resource_translation_draft");
    expect(update).toContain("translation.version<>expected_version");
    expect(update).toContain("translation.review_status<>'draft'");
    expect(update).toContain("source_translation_version=english_version");
    expect(update).toContain("reviewed_by=null");
    expect(update).toContain("updated_by=actor");
    expect(update).not.toContain("input_locale");
    expect(update).not.toContain("target_resource_id");
    expect(update).not.toContain("slug");
  });

  it("submits only current valid drafts and records the server actor", () => {
    const submit = functionBody("public", "submit_resource_translation");
    expect(submit).toContain("translation.version<>expected_version");
    expect(submit).toContain("translation.review_status<>'draft'");
    expect(submit).toContain("private.validate_resource_translation_content");
    expect(submit).toContain("translation.source_translation_version<>english_version");
    expect(submit).toContain("review_status='in_review',submitted_by=actor");
  });

  it("withdraws only in-review translations without publishing them", () => {
    const withdraw = functionBody("public", "withdraw_resource_translation");
    expect(withdraw).toContain("translation.version<>expected_version");
    expect(withdraw).toContain("translation.review_status<>'in_review'");
    expect(withdraw).toContain("review_status='draft'");
    expect(withdraw).toContain("submitted_by=null");
    expect(withdraw).not.toContain("published_at");
    expect(withdraw).not.toContain("status='published'");
  });

  it("requires a different reviewer, a current source, and an in-review translation for approval", () => {
    const approve = functionBody("public", "approve_resource_translation");
    expect(approve).toContain("translation.version<>expected_version");
    expect(approve).toContain("translation.review_status<>'in_review' or translation.submitted_by=actor");
    expect(approve).toContain("translation.source_translation_version<>english_version");
    expect(approve).toContain("review_status='approved',reviewed_by=actor");
    expect(approve).not.toContain("input_reviewer");
    expect(approve).not.toContain("status='published'");
  });

  it("requires a different reviewer and a bounded rejection note", () => {
    const reject = functionBody("public", "reject_resource_translation");
    expect(reject).toContain("translation.version<>expected_version");
    expect(reject).toContain("translation.review_status<>'in_review' or translation.submitted_by=actor");
    expect(reject).toContain("not between 10 and 1000");
    expect(reject).toContain("review_note=btrim(input_rejection_note)");
    expect(reject).toContain("reviewed_by=actor");
    expect(reject).not.toContain("input_reviewer");
  });

  it("keeps translation records independent of parent slug and preserves them across restore", () => {
    for (const name of [
      "create_resource_translation_draft",
      "update_resource_translation_draft",
      "submit_resource_translation",
      "withdraw_resource_translation",
      "approve_resource_translation",
      "reject_resource_translation",
    ]) {
      expect(functionBody("public", name)).not.toContain("translation_slug");
    }
    const parentTransition = functionBody("public", "transition_resource");
    expect(parentTransition).toContain("input_action='restore'");
    expect(parentTransition).toContain(
      "next_status:='draft'; next_review:='draft'; audit_action:='restored'",
    );
    expect(parentTransition).toContain("translation.locale='en'");
    expect(parentTransition).not.toContain("delete from public.resource_translations");
  });

  it("uses optimistic concurrency in every non-create transition", () => {
    for (const name of [
      "update_resource_translation_draft",
      "submit_resource_translation",
      "withdraw_resource_translation",
      "approve_resource_translation",
      "reject_resource_translation",
    ]) {
      const body = functionBody("public", name);
      expect(body).toContain("expected_version integer");
      expect(body).toContain("translation.version<>expected_version");
      expect(body).toContain("errcode='40001'");
    }
  });
});
