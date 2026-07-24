import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const excludedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
  );
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name) ? [] : listTypeScriptFiles(filename);
    }
    return entry.isFile() && /\.tsx?$/u.test(entry.name) ? [filename] : [];
  });
}

function hasUseServerDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === "use server") return true;
  }
  return false;
}

function isTypeOnlyExport(statement: ts.Statement): boolean {
  if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return true;
  if (!ts.isExportDeclaration(statement)) return false;
  if (statement.isTypeOnly) return true;
  if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) return false;
  return statement.exportClause.elements.every((element) => element.isTypeOnly);
}

function isExportedRuntimeStatement(statement: ts.Statement): boolean {
  if (isTypeOnlyExport(statement)) return false;
  return (
    hasModifier(statement, ts.SyntaxKind.ExportKeyword) ||
    ts.isExportAssignment(statement) ||
    ts.isExportDeclaration(statement)
  );
}

describe("Server Actions module boundaries", () => {
  it("limits every top-level use server module's runtime exports to async functions", () => {
    const modules = listTypeScriptFiles(process.cwd())
      .map((filename) => {
        const source = readFileSync(filename, "utf8");
        return {
          filename,
          sourceFile: ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true),
        };
      })
      .filter(({ sourceFile }) => hasUseServerDirective(sourceFile));

    expect(modules.length).toBeGreaterThan(0);

    for (const { filename, sourceFile } of modules) {
      const runtimeExports = sourceFile.statements.filter(isExportedRuntimeStatement);

      for (const statement of runtimeExports) {
        expect(ts.isFunctionDeclaration(statement), filename).toBe(true);
        if (ts.isFunctionDeclaration(statement)) {
          expect(hasModifier(statement, ts.SyntaxKind.AsyncKeyword), filename).toBe(true);
        }
      }
    }
  });
});
