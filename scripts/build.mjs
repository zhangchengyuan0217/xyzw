import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const viteBin = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url),
);

function run(command, args) {
  const child = spawn(command, args, { stdio: "inherit" });
  child.on("error", (error) => {
    if (command === "bash" && error.code === "ENOENT") {
      run(process.execPath, [viteBin, "build"]);
      return;
    }
    console.error(error);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (process.platform === "win32") {
  run(process.execPath, [viteBin, "build"]);
} else {
  // Cloudflare Pages starts with a small open-file limit. Raise it in the
  // same shell that launches Vite, otherwise the build dies with EMFILE.
  const command = `ulimit -n 65535 || true; exec ${JSON.stringify(process.execPath)} ${JSON.stringify(viteBin)} build`;
  run("bash", ["-c", command]);
}
