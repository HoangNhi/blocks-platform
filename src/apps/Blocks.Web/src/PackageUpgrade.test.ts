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
