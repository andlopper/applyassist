import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createManifest } from "../../manifest.config.ts";
import { checkManifestFile, validateManifest } from "../../scripts/check-manifest.mjs";

function validManifest(): Record<string, unknown> {
  return { ...createManifest("0.1.0") };
}

describe("validateManifest", () => {
  it("accepts the approved manifest policy", () => {
    expect(validateManifest(validManifest())).toEqual([]);
  });

  it("rejects a non-object manifest", () => {
    expect(validateManifest(null)).toContain("Manifest must be a JSON object.");
  });

  it.each([
    "content_scripts",
    "host_permissions",
    "web_accessible_resources",
    "externally_connectable",
  ])("rejects the forbidden %s field", (field) => {
    const manifest = validManifest();
    manifest[field] = [];

    expect(validateManifest(manifest)).toContain(`Forbidden manifest field: ${field}.`);
  });

  it("rejects all-URLs access", () => {
    const manifest = validManifest();
    manifest.optional_host_permissions = ["<all_urls>"];

    expect(validateManifest(manifest)).toContain("The <all_urls> match pattern is forbidden.");
  });

  it("rejects a weakened extension pages content security policy", () => {
    const manifest = validManifest();
    manifest.content_security_policy = {
      extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'",
    };

    expect(validateManifest(manifest)).toContain(
      "content_security_policy.extension_pages does not match the required policy.",
    );
  });

  it("rejects permissions outside the approved list", () => {
    const manifest = validManifest();
    manifest.permissions = [...createManifest("0.1.0").permissions, "tabs"];

    expect(validateManifest(manifest)).toContain("Forbidden permission: tabs.");
  });

  it("rejects missing required permissions", () => {
    const manifest = validManifest();
    manifest.permissions = ["activeTab"];

    expect(validateManifest(manifest)).toContain("Missing required permission: scripting.");
  });

  it("rejects permissions that are not strings", () => {
    const manifest = validManifest();
    manifest.permissions = ["activeTab", 1];

    expect(validateManifest(manifest)).toContain("permissions must be an array of strings.");
  });

  it("rejects duplicate permissions", () => {
    const manifest = validManifest();
    manifest.permissions = [...createManifest("0.1.0").permissions, "activeTab"];

    expect(validateManifest(manifest)).toContain("Duplicate permissions are not allowed.");
  });

  it("requires the approved optional host permissions", () => {
    const manifest = validManifest();
    manifest.optional_host_permissions = ["https://example.com/*"];

    expect(validateManifest(manifest)).toContain(
      "Unexpected optional host permissions; expected only the approved AI provider hosts.",
    );
  });

  it("rejects optional host permissions that are not strings", () => {
    const manifest = validManifest();
    manifest.optional_host_permissions = [1];

    expect(validateManifest(manifest)).toContain(
      "Unexpected optional host permissions; expected only the approved AI provider hosts.",
    );
  });

  it("requires Manifest V3", () => {
    const manifest = validManifest();
    manifest.manifest_version = 2;

    expect(validateManifest(manifest)).toContain("manifest_version must be 3.");
  });

  it("checks a manifest read from a file", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "applyassist-manifest-"));

    try {
      const manifestPath = resolve(directory, "manifest.json");
      await writeFile(manifestPath, JSON.stringify(createManifest("0.1.0")), "utf8");

      await expect(checkManifestFile(manifestPath)).resolves.toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns policy violations from a manifest file", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "applyassist-manifest-"));

    try {
      const manifestPath = resolve(directory, "manifest.json");
      const manifest = { ...createManifest("0.1.0"), host_permissions: [] };
      await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

      await expect(checkManifestFile(manifestPath)).resolves.toContain(
        "Forbidden manifest field: host_permissions.",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
