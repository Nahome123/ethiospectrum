import { describe, expect, it } from "vitest";
import {
  getRoleHomePath,
  hasSpecialistRole,
  roleChangedSignOutPath,
  roleChangedSinceSignIn,
  sessionSignedInAt,
} from "@/lib/auth/role-session";

const signIn = Date.parse("2026-10-01T12:00:00Z") / 1000;

describe("role session freshness", () => {
  it("uses the authentication time, not the refreshed token time", () => {
    expect(sessionSignedInAt({ iat: signIn + 3600, amr: [{ method: "password", timestamp: signIn }] })).toBe(
      signIn,
    );
  });

  it("falls back to the token issue time without authentication methods", () => {
    expect(sessionSignedInAt({ iat: signIn })).toBe(signIn);
    expect(sessionSignedInAt({})).toBeNull();
  });

  it("requires a new sign-in when the role changed after signing in", () => {
    const claims = { iat: signIn + 3600, amr: [{ method: "password", timestamp: signIn }] };
    expect(roleChangedSinceSignIn("2026-10-01T12:30:00Z", claims)).toBe(true);
  });

  it("keeps a session that signed in after the role change", () => {
    const claims = { amr: [{ method: "password", timestamp: signIn }] };
    expect(roleChangedSinceSignIn("2026-10-01T11:00:00Z", claims)).toBe(false);
    expect(roleChangedSinceSignIn("2026-10-01T12:00:00.900Z", claims)).toBe(false);
  });

  it("does not end sessions on missing or malformed data", () => {
    expect(roleChangedSinceSignIn(null, { iat: signIn })).toBe(false);
    expect(roleChangedSinceSignIn("not a date", { iat: signIn })).toBe(false);
    expect(roleChangedSinceSignIn("2026-10-01T13:00:00Z", {})).toBe(false);
  });

  it("signs out through the route handler in the current locale", () => {
    expect(roleChangedSignOutPath("am")).toBe("/auth/signout?reason=role-changed&locale=am");
  });
});

describe("role workspaces", () => {
  it("sends each role to its own workspace", () => {
    expect(getRoleHomePath("en", "administrator")).toBe("/en/admin");
    expect(getRoleHomePath("es", "specialist")).toBe("/es/specialist");
    expect(getRoleHomePath("am", "member")).toBe("/am/dashboard");
    expect(getRoleHomePath("en", null)).toBe("/en/dashboard");
  });

  it("treats administrators as specialists", () => {
    expect(hasSpecialistRole("administrator")).toBe(true);
    expect(hasSpecialistRole("specialist")).toBe(true);
    expect(hasSpecialistRole("member")).toBe(false);
    expect(hasSpecialistRole(null)).toBe(false);
  });
});
