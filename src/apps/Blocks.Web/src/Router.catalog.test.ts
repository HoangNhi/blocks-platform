/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import ts from "typescript";

function routePaths(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    "Router.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const paths: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === "Route") {
        for (const attr of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attr) &&
            attr.name.getText(sourceFile) === "path" &&
            attr.initializer &&
            ts.isStringLiteral(attr.initializer)
          ) {
            paths.push(attr.initializer.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return paths;
}

describe("Router catalog routes and retained faculty", () => {
  const retiredPaths = ["/filetype", "/stakeholder", "/standard", "/standardset"];

  it("router_removes_retired_catalog_routes_and_keeps_faculty", () => {
    const routerSource = readFileSync(new URL("./Router.tsx", import.meta.url), "utf8");
    const paths = routePaths(routerSource);

    expect(paths).toContain("/faculty");
    for (const retired of retiredPaths) {
      expect(paths).not.toContain(retired);
    }
    expect(paths.sort()).toEqual([
      "/", "/login", "/user", "/faculty", "/systemgroup",
      "/menu", "/role", "/auditlog", "/unauthorized", "*",
    ].sort());
  });
});
