import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
  );
}

describe("document processing server actions module", () => {
  it("keeps its top-level use server directive and exports only async functions", () => {
    const filename = path.join(process.cwd(), "lib/documents/processing-actions.ts");
    const source = readFileSync(filename, "utf8");
    const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const firstStatement = sourceFile.statements[0];
    const exportedStatements = sourceFile.statements.filter((statement) =>
      hasModifier(statement, ts.SyntaxKind.ExportKeyword),
    );

    expect(firstStatement && ts.isExpressionStatement(firstStatement)).toBe(true);
    if (!firstStatement || !ts.isExpressionStatement(firstStatement)) return;
    expect(ts.isStringLiteral(firstStatement.expression)).toBe(true);
    if (!ts.isStringLiteral(firstStatement.expression)) return;
    expect(firstStatement.expression.text).toBe("use server");
    expect(exportedStatements.length).toBeGreaterThan(0);

    for (const statement of exportedStatements) {
      expect(ts.isFunctionDeclaration(statement)).toBe(true);
      if (ts.isFunctionDeclaration(statement)) {
        expect(hasModifier(statement, ts.SyntaxKind.AsyncKeyword)).toBe(true);
      }
    }
  });
});
