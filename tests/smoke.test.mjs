import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

assert.equal(existsSync(cli), true, "dist/cli.js should exist; run npm run build first");

const help = execFileSync(process.execPath, [cli, "--help"], { cwd: root, encoding: "utf8" });
assert.match(help, /DesktopCLI/);
assert.match(help, /wechat/);

const apps = execFileSync(process.execPath, [cli, "app", "list", "--json"], { cwd: root, encoding: "utf8" });
const appsResult = JSON.parse(apps);
assert.equal(appsResult.ok, true);
assert.equal(appsResult.data.some((app) => app.name === "jianying"), true);
assert.equal(appsResult.data.some((app) => app.name === "capcut"), true);

const dryRun = execFileSync(process.execPath, [cli, "wechat", "send", "--to", "文件传输助手", "--text", "hello", "--json"], {
  cwd: root,
  encoding: "utf8"
});
const dryRunResult = JSON.parse(dryRun);
assert.equal(dryRunResult.ok, true);
assert.equal(dryRunResult.data.dryRun, true);
assert.equal(dryRunResult.warnings[0].includes("dry-run"), true);

const sendFile = execFileSync(process.execPath, [cli, "wechat", "send-file", "--to", "文件传输助手", "--file", "README.md", "--json"], {
  cwd: root,
  encoding: "utf8"
});
const sendFileResult = JSON.parse(sendFile);
assert.equal(sendFileResult.ok, true);
assert.equal(sendFileResult.data.steps.some((step) => step.action === "paste-files"), true);

const capcutImport = execFileSync(process.execPath, [cli, "capcut", "import", "--file", "C:\\demo.mp4", "--json"], {
  cwd: root,
  encoding: "utf8"
});
const capcutImportResult = JSON.parse(capcutImport);
assert.equal(capcutImportResult.ok, true);
assert.equal(capcutImportResult.data.steps.some((step) => step.action === "files-to-clipboard"), true);

console.log("smoke tests passed");
