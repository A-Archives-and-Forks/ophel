import { spawnSync } from "node:child_process"
import { existsSync, rmSync, statSync } from "node:fs"
import path from "node:path"

const rootDir = process.cwd()
const sourceDir = path.join(rootDir, "build", "firefox-mv3-prod")
const outputZip = path.join(rootDir, "build", "firefox-mv3-prod.zip")

if (!existsSync(sourceDir)) {
  console.error(`Firefox build output not found: ${sourceDir}`)
  console.error("Run `pnpm build:firefox` before packaging.")
  process.exit(1)
}

rmSync(outputZip, { force: true })

const zipResult = spawnSync("zip", ["-q", "-r", outputZip, "."], {
  cwd: sourceDir,
  stdio: "inherit",
})

if (zipResult.error) {
  if (zipResult.error.code === "ENOENT") {
    console.error("`zip` command is not available on this machine.")
  } else {
    console.error(zipResult.error.message)
  }
  process.exit(1)
}

if (zipResult.status !== 0) {
  process.exit(zipResult.status ?? 1)
}

const testResult = spawnSync("zip", ["-T", outputZip], { stdio: "inherit" })

if (testResult.error) {
  console.error(testResult.error.message)
  process.exit(1)
}

if (testResult.status !== 0) {
  process.exit(testResult.status ?? 1)
}

const sizeInMb = (statSync(outputZip).size / 1024 / 1024).toFixed(2)
console.log(`Created ${path.relative(rootDir, outputZip)} (${sizeInMb} MB)`)
