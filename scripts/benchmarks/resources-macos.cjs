// Browser plugin absent. A temporary diagnostic copy keeps profiling hooks out of the preview.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { execFileSync, spawn } = require("node:child_process");
const root = path.resolve(__dirname, "../.."),
  work = fs.mkdtempSync(path.join(os.tmpdir(), "svelto-resource-app-"));
const source =
  process.env.SVELTO_TEST_EXECUTABLE ||
  path.join(root, "dist/app/mac-arm64/Svelto.app/Contents/MacOS/Svelto");
const bundle = path.resolve(source, "../../.."),
  target = path.join(work, "Svelto.app"),
  profiles = path.join(root, "output/resource-profiles");
fs.mkdirSync(profiles, { recursive: true });
execFileSync("/usr/bin/ditto", [bundle, target]);
fs.appendFileSync(
  path.join(target, "Contents/Resources/app/main.build.js"),
  "\n" + fs.readFileSync(path.join(__dirname, "resource-hooks.cjs"), "utf8")
);
execFileSync("/usr/bin/codesign", ["-s", "-", "-f", "--deep", target], {
  stdio: "inherit",
});
const child = spawn(
  process.execPath,
  [path.join(__dirname, "usage-macos.cjs")],
  {
    cwd: root,
    env: {
      ...process.env,
      SVELTO_TEST_EXECUTABLE: path.join(target, "Contents/MacOS/Svelto"),
      SVELTO_RESOURCE_PROFILE_DIR: profiles,
      SVELTO_USAGE_MODE: "resources",
    },
    stdio: "inherit",
  }
);
child.on("exit", (code) => {
  fs.rmSync(work, { recursive: true, force: true });
  process.exitCode = code || 0;
});
