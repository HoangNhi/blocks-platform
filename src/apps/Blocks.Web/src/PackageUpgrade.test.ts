// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import viteConfigExport from "../vite.config";

const __filename = fileURLToPath(import.meta.url);
const srcDir = dirname(__filename);
const webDir = resolve(srcDir, "..");

describe("PackageUpgrade", () => {
  it("toolchain_ranges_match_approved_matrix", () => {
    const pkg = JSON.parse(readFileSync(resolve(webDir, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(resolve(webDir, "package-lock.json"), "utf8"));
    const rootLock = lock.packages?.[""];

    expect(pkg.dependencies["@tailwindcss/vite"]).toBe("^4.3.3");
    expect(pkg.dependencies["tailwindcss"]).toBe("^4.3.3");

    expect(pkg.devDependencies["@eslint/js"]).toBe("^9.39.2");
    expect(pkg.devDependencies["@testing-library/react"]).toBe("^16.3.3");
    expect(pkg.devDependencies["@types/node"]).toBe("^24.19.2");
    expect(pkg.devDependencies["@vitejs/plugin-react"]).toBe("^6.1.2");
    expect(pkg.devDependencies["eslint-plugin-react-hooks"]).toBe("^7.1.1");
    expect(pkg.devDependencies["eslint-plugin-react-refresh"]).toBe("^0.5.7");
    expect(pkg.devDependencies["globals"]).toBe("^17.13.0");
    expect(pkg.devDependencies["typescript"]).toBe("~6.0.3");
    expect(pkg.devDependencies["typescript-eslint"]).toBe("^8.72.0");
    expect(pkg.devDependencies["vite"]).toBe("^8.3.5");
    expect(pkg.devDependencies["vitest"]).toBe("^5.0.5");

    expect(rootLock.devDependencies).toEqual(pkg.devDependencies);
    expect(rootLock.dependencies).toEqual(pkg.dependencies);

    for (const [pkgPath, entry] of Object.entries(lock.packages ?? {})) {
      const pkgEntry = entry as { name?: string };
      expect(pkgEntry.name, `Package at ${pkgPath} must not be rolldown-vite`).not.toBe("rolldown-vite");
    }
  });

  it("runtime_ranges_match_approved_matrix", () => {
    const pkg = JSON.parse(readFileSync(resolve(webDir, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(resolve(webDir, "package-lock.json"), "utf8"));
    const rootLock = lock.packages?.[""];

    const runtimeKeys = Object.keys(pkg.dependencies).sort();
    const devKeys = Object.keys(pkg.devDependencies).sort();

    expect(runtimeKeys).toHaveLength(41);
    expect(devKeys).toHaveLength(18);

    const expectedRuntimeKeys = [
      "@hookform/resolvers",
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
      "@tailwindcss/vite",
      "@tanstack/react-query",
      "@tanstack/react-table",
      "axios",
      "class-variance-authority",
      "clsx",
      "cmdk",
      "date-fns",
      "express",
      "js-cookie",
      "jwt-decode",
      "lucide-react",
      "next-themes",
      "radix-ui",
      "react",
      "react-day-picker",
      "react-dom",
      "react-hook-form",
      "react-router-dom",
      "sonner",
      "tailwind-merge",
      "tailwindcss",
      "uuid",
      "zod",
    ].sort();

    const expectedDevKeys = [
      "@eslint/js",
      "@testing-library/jest-dom",
      "@testing-library/react",
      "@types/js-cookie",
      "@types/node",
      "@types/react",
      "@types/react-dom",
      "@vitejs/plugin-react",
      "eslint",
      "eslint-plugin-react-hooks",
      "eslint-plugin-react-refresh",
      "globals",
      "jsdom",
      "tw-animate-css",
      "typescript",
      "typescript-eslint",
      "vite",
      "vitest",
    ].sort();

    expect(runtimeKeys).toEqual(expectedRuntimeKeys);
    expect(devKeys).toEqual(expectedDevKeys);

    // Task 3 runtime matrix
    expect(pkg.dependencies["@hookform/resolvers"]).toBe("^6.0.0");
    expect(pkg.dependencies["@radix-ui/react-accordion"]).toBe("^1.3.1");
    expect(pkg.dependencies["@radix-ui/react-avatar"]).toBe("^1.3.1");
    expect(pkg.dependencies["@radix-ui/react-checkbox"]).toBe("^1.4.1");
    expect(pkg.dependencies["@radix-ui/react-collapsible"]).toBe("^1.2.1");
    expect(pkg.dependencies["@radix-ui/react-dialog"]).toBe("^1.3.1");
    expect(pkg.dependencies["@radix-ui/react-dropdown-menu"]).toBe("^2.2.1");
    expect(pkg.dependencies["@radix-ui/react-label"]).toBe("^2.1.17");
    expect(pkg.dependencies["@radix-ui/react-popover"]).toBe("^1.3.1");
    expect(pkg.dependencies["@radix-ui/react-progress"]).toBe("^1.2.1");
    expect(pkg.dependencies["@radix-ui/react-radio-group"]).toBe("^1.5.1");
    expect(pkg.dependencies["@radix-ui/react-scroll-area"]).toBe("^1.4.0");
    expect(pkg.dependencies["@radix-ui/react-select"]).toBe("^2.4.1");
    expect(pkg.dependencies["@radix-ui/react-separator"]).toBe("^1.2.0");
    expect(pkg.dependencies["@radix-ui/react-slot"]).toBe("^1.5.0");
    expect(pkg.dependencies["@radix-ui/react-tabs"]).toBe("^1.2.1");
    expect(pkg.dependencies["@radix-ui/react-tooltip"]).toBe("^1.4.1");
    expect(pkg.dependencies["@tanstack/react-query"]).toBe("^5.104.5");
    expect(pkg.dependencies["axios"]).toBe("^1.20.0");
    expect(pkg.dependencies["date-fns"]).toBe("^4.4.0");
    expect(pkg.dependencies["express"]).toBe("^5.3.0");
    expect(pkg.dependencies["js-cookie"]).toBe("^3.0.8");
    expect(pkg.dependencies["lucide-react"]).toBe("^1.61.0");
    expect(pkg.dependencies["radix-ui"]).toBe("^1.8.1");
    expect(pkg.dependencies["react"]).toBe("^19.3.1");
    expect(pkg.dependencies["react-dom"]).toBe("^19.3.1");
    expect(pkg.dependencies["react-hook-form"]).toBe("^7.91.0");
    expect(pkg.dependencies["react-router-dom"]).toBe("^7.18.4");
    expect(pkg.dependencies["sonner"]).toBe("^2.0.8");
    expect(pkg.dependencies["tailwind-merge"]).toBe("^3.7.0");
    expect(pkg.dependencies["uuid"]).toBe("^14.0.3");
    expect(pkg.dependencies["zod"]).toBe("^4.6.7");

    // Task 3 dev matrix
    expect(pkg.devDependencies["@types/react"]).toBe("^19.3.0");
    expect(pkg.devDependencies["@types/react-dom"]).toBe("^19.3.0");

    // Retained runtime dependencies
    expect(pkg.dependencies["class-variance-authority"]).toBe("^0.7.1");
    expect(pkg.dependencies["clsx"]).toBe("^2.1.1");
    expect(pkg.dependencies["cmdk"]).toBe("^1.1.1");
    expect(pkg.dependencies["jwt-decode"]).toBe("^4.0.0");
    expect(pkg.dependencies["next-themes"]).toBe("^0.4.6");

    // Retained dev dependencies
    expect(pkg.devDependencies["@testing-library/jest-dom"]).toBe("^6.9.1");
    expect(pkg.devDependencies["@types/js-cookie"]).toBe("^3.0.6");
    expect(pkg.devDependencies["eslint"]).toBe("^9.39.2");
    expect(pkg.devDependencies["jsdom"]).toBe("^28.1.0");
    expect(pkg.devDependencies["tw-animate-css"]).toBe("^1.4.0");

    expect(rootLock.devDependencies).toEqual(pkg.devDependencies);
    expect(rootLock.dependencies).toEqual(pkg.dependencies);
    expect(pkg.overrides).toBeUndefined();
  });

  it("daypicker_range_matches_approved_matrix", () => {
    const pkg = JSON.parse(readFileSync(resolve(webDir, "package.json"), "utf8"));
    expect(pkg.dependencies["react-day-picker"]).toBe("^10.0.2");
  });

  it("dev_port_and_alias_contract_are_preserved", async () => {
    const originalDevPort = process.env.VITE_DEV_PORT;
    try {
      process.env.VITE_DEV_PORT = "";
      const resolveConfig = async () => {
        if (typeof viteConfigExport === "function") {
          return await viteConfigExport({ mode: "development", command: "serve", isSsrBuild: false, isPreview: false });
        }
        return viteConfigExport;
      };

      const defaultConfig = await resolveConfig();
      expect(defaultConfig.server?.port).toBe(3000);
      expect(defaultConfig.server?.host).toBe(true);

      const expectedAliasPath = resolve(webDir, "src");
      const alias = defaultConfig.resolve?.alias;
      const resolvedAlias = Array.isArray(alias)
        ? alias.find((a) => a.find === "@")?.replacement
        : (alias as Record<string, string>)?.[`@`];
      expect(resolvedAlias).toBe(expectedAliasPath);

      process.env.VITE_DEV_PORT = "5173";
      const aspireConfig = await resolveConfig();
      expect(aspireConfig.server?.port).toBe(5173);
      expect(aspireConfig.server?.host).toBe(true);
    } finally {
      if (originalDevPort !== undefined) {
        process.env.VITE_DEV_PORT = originalDevPort;
      } else {
        delete process.env.VITE_DEV_PORT;
      }
    }
  });
});
