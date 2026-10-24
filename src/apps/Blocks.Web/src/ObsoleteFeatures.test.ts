// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const srcDir = dirname(__filename);
const webDir = resolve(srcDir, "..");

function getProductionSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === "test") {
        continue;
      }
      files.push(...getProductionSourceFiles(fullPath));
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !entry.endsWith(".spec.ts") &&
      !entry.endsWith(".spec.tsx")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

const obsoletePaths = [
  "features/business",
  "features/catalog/api/filetype.api.ts",
  "features/catalog/api/standard.api.ts",
  "features/catalog/api/standardset.api.ts",
  "features/catalog/components/MultiStandardSetPanel.tsx",
  "features/catalog/components/StandardCriteriaTable.tsx",
  "features/catalog/hooks/useFileTypeOptions.ts",
  "features/catalog/hooks/useMultiStandardSets.ts",
  "features/catalog/hooks/useStandardSetOptions.ts",
  "features/catalog/hooks/useStandardsWithCriteria.ts",
  "features/catalog/types/filetype.types.ts",
  "features/catalog/types/stakeholder.types.ts",
  "features/catalog/types/standard.types.ts",
  "features/catalog/types/standardset.types.ts",
  "constants/business.constants.ts",
  "constants/catalog.constants.ts",
  "constants/roles.ts",
  "components/ui/chart.tsx",
  "components/ui/upload-file.tsx",
  "components/ui/upload-file.test.tsx",
  "components/ui/file-viewer-dialog.tsx",
  "components/ui/file-viewer-dialog.test.tsx",
  "components/ui/excel-viewer.tsx",
  "components/ui/pdf-viewer.tsx",
  "components/ui/carousel.tsx",
  "lib/pdf-worker.ts",
  "lib/file-utils.ts",
];

const retiredModulePatterns = [
  /\/features\/business(\/|$)/,
  /\/catalog\/api\/(filetype|standard|standardset)\.api/,
  /\/catalog\/components\/(MultiStandardSetPanel|StandardCriteriaTable)/,
  /\/catalog\/hooks\/(useFileTypeOptions|useMultiStandardSets|useStandardSetOptions|useStandardsWithCriteria)/,
  /\/catalog\/types\/(filetype|stakeholder|standard|standardset)\.types/,
  /\/constants\/(business\.constants|catalog\.constants|roles)/,
  /\/components\/ui\/(chart|upload-file|file-viewer-dialog|excel-viewer|pdf-viewer|carousel)/,
  /\/lib\/(pdf-worker|file-utils)/,
];

describe("ObsoleteFeatures", () => {
  it("obsolete_files_and_directories_are_absent", () => {
    for (const relPath of obsoletePaths) {
      const fullPath = resolve(srcDir, relPath);
      expect(existsSync(fullPath), `Expected ${relPath} to be absent`).toBe(false);
    }
  });

  it("retained_faculty_and_brand_assets_remain", () => {
    const retainedFiles = [
      "features/catalog/routes/Faculty/FacultyPage.tsx",
      "features/catalog/api/faculty.api.ts",
      "features/catalog/hooks/useFaculty.ts",
      "features/catalog/types/faculty.types.ts",
      "assets/react.svg",
    ];
    for (const relPath of retainedFiles) {
      const fullPath = resolve(srcDir, relPath);
      expect(existsSync(fullPath), `Expected active file ${relPath} to exist`).toBe(true);
    }

    const brandAssets = ["public/blocks.png", "public/login.png", "public/vite.svg"];
    for (const relPath of brandAssets) {
      const fullPath = resolve(webDir, relPath);
      expect(existsSync(fullPath), `Expected brand asset ${relPath} to exist`).toBe(true);
    }
  });

  it("production_sources_do_not_import_obsolete_modules", () => {
    const prodFiles = getProductionSourceFiles(srcDir);
    expect(prodFiles.length).toBeGreaterThan(0);

    for (const filePath of prodFiles) {
      const content = readFileSync(filePath, "utf8");
      const sf = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );

      const importSpecifiers: string[] = [];
      function visit(node: ts.Node) {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          importSpecifiers.push(node.moduleSpecifier.text);
        } else if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          importSpecifiers.push(node.moduleSpecifier.text);
        }
        ts.forEachChild(node, visit);
      }
      visit(sf);

      const relFromSrc = relative(srcDir, filePath);
      for (const spec of importSpecifiers) {
        const normalized = spec.replace(/\\/g, "/");
        for (const pattern of retiredModulePatterns) {
          expect(
            pattern.test(normalized),
            `${relFromSrc} imports obsolete module "${spec}" matching ${pattern}`
          ).toBe(false);
        }
      }
    }
  });

  it("auth_layer_does_not_contain_obsolete_external_reviewer_marker", () => {
    const targetFiles = [
      "contexts/AuthContext.tsx",
      "hooks/useAuth.ts",
      "features/system/types/auth.types.ts",
    ];

    for (const relPath of targetFiles) {
      const fullPath = resolve(srcDir, relPath);
      const content = readFileSync(fullPath, "utf8");
      expect(content, `${relPath} should not reference EXT_ROLE_ID`).not.toContain("EXT_ROLE_ID");
      expect(content, `${relPath} should not reference isExternalReviewer`).not.toContain(
        "isExternalReviewer"
      );
    }
  });

  it("index_css_purges_tiptap_custom_scrollbar_and_chart_rules", () => {
    const cssPath = resolve(srcDir, "styles/index.css");
    const content = readFileSync(cssPath, "utf8");

    expect(content).not.toContain(".ProseMirror");
    expect(content).not.toContain("collaboration-cursor");
    expect(content).not.toContain(".custom-scrollbar");
    expect(content).not.toContain("--chart-1");
    expect(content).not.toContain("--color-chart-1");

    // Retain base animations
    expect(content).toContain(".animate-in");
    expect(content).toContain("@keyframes fadeIn");
  });

  it("approved_dead_packages_are_absent_from_manifest_and_lockfile", () => {
    const pkgPath = resolve(webDir, "package.json");
    const lockPath = resolve(webDir, "package-lock.json");

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));

    const deadPackages = [
      "@sereneinserenade/tiptap-comment-extension",
      "@tiptap/extension-collaboration",
      "@tiptap/extension-collaboration-cursor",
      "@tiptap/extension-image",
      "@tiptap/extension-link",
      "@tiptap/extension-table",
      "@tiptap/extension-table-cell",
      "@tiptap/extension-table-header",
      "@tiptap/extension-table-of-contents",
      "@tiptap/extension-table-row",
      "@tiptap/extension-text-align",
      "@tiptap/extension-underline",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "docx-preview",
      "pdfjs-dist",
      "recharts",
      "xlsx",
      "y-websocket",
      "yjs",
    ];

    for (const name of deadPackages) {
      expect(pkg.dependencies?.[name], `package.json should not contain ${name}`).toBeUndefined();
      expect(
        lock.packages?.[""]?.dependencies?.[name],
        `package-lock.json root should not contain ${name}`
      ).toBeUndefined();
    }

    // Official Vite 8 assertions
    expect(pkg.devDependencies?.vite).toBe("^8.3.5");
    expect(lock.packages?.[""]?.devDependencies?.vite).toBe("^8.3.5");
    expect(pkg.overrides?.vite).toBeUndefined();
    expect(lock.packages?.["node_modules/vite"]?.version).toMatch(/^8\./);

    const installedVitePath = resolve(webDir, "node_modules/vite/package.json");
    const installedVite = JSON.parse(readFileSync(installedVitePath, "utf8"));
    expect(installedVite.name).toBe("vite");

    // Retained dependencies remain
    const retainedDependencies = [
      "uuid",
      "date-fns",
      "react-day-picker",
      "cmdk",
      "radix-ui",
      "@radix-ui/react-accordion",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@tanstack/react-query",
      "@tanstack/react-table",
      "axios",
      "js-cookie",
      "jwt-decode",
    ];

    for (const name of retainedDependencies) {
      expect(pkg.dependencies?.[name], `package.json should retain ${name}`).toBeDefined();
      expect(
        lock.packages?.[""]?.dependencies?.[name],
        `package-lock.json should retain ${name}`
      ).toBeDefined();
    }
  });
});
