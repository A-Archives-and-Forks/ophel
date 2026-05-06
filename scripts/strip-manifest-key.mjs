/**
 * Strip manifest key and clean web_accessible_resources
 *
 * Removes the `key` field from manifest.json and filters
 * web_accessible_resources entries that reference non-existent files.
 * Safe to run on both CWS upload and Edge Add-ons Store builds.
 *
 * Plasmo multi-pass compilation can leave stale CSS references in manifest
 * that have already been merged into JS bundles — this script removes them.
 *
 * Usage: node scripts/strip-manifest-key.mjs <build-dir>
 */

import fs from "fs"
import path from "path"

const buildDir = process.argv[2]
if (!buildDir) {
  console.error("[strip-manifest-key] Usage: node strip-manifest-key.mjs <build-dir>")
  process.exit(1)
}

const manifestPath = path.join(buildDir, "manifest.json")
if (!fs.existsSync(manifestPath)) {
  console.error(`[strip-manifest-key] manifest.json not found in: ${buildDir}`)
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"))

// Remove key field
if (pkg.key) {
  delete pkg.key
  console.log("[strip-manifest-key] Removed 'key' field.")
}

// Filter out web_accessible_resources entries pointing to non-existent files.
// Wildcards and __MSG_* placeholders are always kept.
if (pkg.web_accessible_resources) {
  pkg.web_accessible_resources = pkg.web_accessible_resources
    .map((entry) => ({
      ...entry,
      resources: entry.resources.filter(
        (r) => r.includes("*") || r.startsWith("__") || fs.existsSync(path.join(buildDir, r)),
      ),
    }))
    .filter((entry) => entry.resources.length > 0)
  console.log("[strip-manifest-key] Cleaned web_accessible_resources.")
}

fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + "\n")
console.log("[strip-manifest-key] Manifest written successfully.")
