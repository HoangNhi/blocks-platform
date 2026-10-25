import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("Branding and Document Identity", () => {
  it("uses_supplied_logo_and_studio_document_identity", () => {
    // ponytail: `${import.meta.url}` prevents Vite static asset plugin from rewriting file: URLs to http: URLs
    const htmlUrl = new URL("../index.html", `${import.meta.url}`);
    const htmlContent = readFileSync(htmlUrl, "utf8");
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const documentHead = doc.head;

    const logoUrl = new URL("../public/blocks.png", `${import.meta.url}`);
    const logoBytes = readFileSync(logoUrl);

    expect(documentHead.querySelector("title")?.textContent).toBe("Blocks Studio");
    expect(documentHead.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe("/blocks.png");
    expect(documentHead.querySelector('link[rel="icon"]')?.getAttribute("type")).toBe("image/png");
    expect(createHash("sha256").update(logoBytes).digest("hex")).toBe("0ce329c391489919cba2f98655f5eade1bbda89b77d63b2c636554f40d76df20");
    expect(logoBytes.readUInt32BE(16)).toBe(1024);
    expect(logoBytes.readUInt32BE(20)).toBe(1024);

    expect(existsSync(new URL("../public/login.png", `${import.meta.url}`))).toBe(true);
    expect(existsSync(new URL("../public/vite.svg", `${import.meta.url}`))).toBe(true);
  });
});
