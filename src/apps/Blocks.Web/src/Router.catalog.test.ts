/// <reference types="node" />
// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

describe("Router catalog routes and business catalog dependencies", () => {
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

  it("business_catalog_dependencies_remain", () => {
    const catalogDir = resolve(__dirname, "features/catalog");
    const requiredFiles = [
      resolve(catalogDir, "api/filetype.api.ts"),
      resolve(catalogDir, "api/standard.api.ts"),
      resolve(catalogDir, "api/standardset.api.ts"),
      resolve(catalogDir, "types/filetype.types.ts"),
      resolve(catalogDir, "types/standard.types.ts"),
      resolve(catalogDir, "types/standardset.types.ts"),
      resolve(catalogDir, "types/stakeholder.types.ts"),
      resolve(catalogDir, "hooks/useFileTypeOptions.ts"),
      resolve(catalogDir, "hooks/useStandardSetOptions.ts"),
      resolve(catalogDir, "hooks/useMultiStandardSets.ts"),
      resolve(catalogDir, "hooks/useStandardsWithCriteria.ts"),
      resolve(catalogDir, "components/MultiStandardSetPanel.tsx"),
      resolve(catalogDir, "components/StandardCriteriaTable.tsx"),
      resolve(__dirname, "constants/catalog.constants.ts"),
    ];

    for (const file of requiredFiles) {
      expect(existsSync(file), `Expected ${file} to exist`).toBe(true);
    }
  });
});
