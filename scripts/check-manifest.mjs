import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const approvedPermissions = ["activeTab", "scripting", "storage", "sidePanel", "identity"];
const approvedOptionalHosts = ["https://openrouter.ai/*", "http://localhost:11434/*"];
const requiredContentSecurityPolicy = "script-src 'self'; object-src 'self'";
const forbiddenFields = [
  "content_scripts",
  "host_permissions",
  "web_accessible_resources",
  "externally_connectable",
];

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function containsAllUrls(value) {
  if (value === "<all_urls>") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(containsAllUrls);
  }

  return isRecord(value) && Object.values(value).some(containsAllUrls);
}

/**
 * @param {unknown} actual
 * @param {string[]} expected
 * @returns {boolean}
 */
function matchesStringSet(actual, expected) {
  if (!isStringArray(actual)) {
    return false;
  }

  const uniqueValues = new Set(actual);
  return (
    uniqueValues.size === expected.length && expected.every((entry) => uniqueValues.has(entry))
  );
}

/**
 * @param {unknown} manifest
 * @returns {string[]}
 */
export function validateManifest(manifest) {
  if (!isRecord(manifest)) {
    return ["Manifest must be a JSON object."];
  }

  const errors = [];

  for (const field of forbiddenFields) {
    if (Object.hasOwn(manifest, field)) {
      errors.push(`Forbidden manifest field: ${field}.`);
    }
  }

  if (containsAllUrls(manifest)) {
    errors.push("The <all_urls> match pattern is forbidden.");
  }

  if (manifest.manifest_version !== 3) {
    errors.push("manifest_version must be 3.");
  }

  if (!isStringArray(manifest.permissions)) {
    errors.push("permissions must be an array of strings.");
  } else {
    const permissions = new Set(manifest.permissions);

    for (const permission of permissions) {
      if (!approvedPermissions.includes(permission)) {
        errors.push(`Forbidden permission: ${permission}.`);
      }
    }

    for (const permission of approvedPermissions) {
      if (!permissions.has(permission)) {
        errors.push(`Missing required permission: ${permission}.`);
      }
    }

    if (permissions.size !== manifest.permissions.length) {
      errors.push("Duplicate permissions are not allowed.");
    }
  }

  if (!matchesStringSet(manifest.optional_host_permissions, approvedOptionalHosts)) {
    errors.push(
      "Unexpected optional host permissions; expected only the approved AI provider hosts.",
    );
  }

  if (
    !isRecord(manifest.content_security_policy) ||
    manifest.content_security_policy.extension_pages !== requiredContentSecurityPolicy
  ) {
    errors.push("content_security_policy.extension_pages does not match the required policy.");
  }

  return errors;
}

/**
 * @param {string} manifestPath
 * @returns {Promise<string[]>}
 */
export async function checkManifestFile(manifestPath) {
  const contents = await readFile(manifestPath, "utf8");
  const manifest = /** @type {unknown} */ (JSON.parse(contents));
  return validateManifest(manifest);
}

async function checkBuiltManifest() {
  const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const manifestPath = resolve(projectRoot, "dist/manifest.json");
  const errors = await checkManifestFile(manifestPath);

  if (errors.length > 0) {
    console.error(`Manifest policy violations:\n${errors.join("\n")}`);
    process.exitCode = 1;
    return;
  }

  console.log("Manifest policy check passed.");
}

if (
  process.argv[1] !== undefined &&
  import.meta.url.startsWith("file:") &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await checkBuiltManifest();
}
