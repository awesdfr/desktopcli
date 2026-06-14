import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
assert.equal(intentSteps(dryRunResult).some((step) => step.action === "mouse-click" && step.x === 360 && step.y === 588), true);

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

const momentsPost = execFileSync(process.execPath, [cli, "wechat", "moments-post", "--text", "晚安", "--json"], {
  cwd: root,
  encoding: "utf8"
});
const momentsPostResult = JSON.parse(momentsPost);
assert.equal(momentsPostResult.ok, true);
assert.equal(intentSteps(momentsPostResult).some((step) => step.action === "mouse-click"), true);
assert.equal(intentSteps(momentsPostResult).some((step) => step.action === "assert" && step.assertion.selector === "title:朋友圈,class:Qt51514QWindowIcon"), true);

const unsafeSend = spawnSync(process.execPath, [cli, "wechat", "send", "--to", "文件传输助手", "--text", "hello", "--yes", "--json"], {
  cwd: root,
  encoding: "utf8"
});
assert.notEqual(unsafeSend.status, 0);
assert.match(unsafeSend.stderr, /--force/);

function intentSteps(result) {
  return result.data.steps ?? result.data.intent?.steps ?? [];
}

console.log("smoke tests passed");
