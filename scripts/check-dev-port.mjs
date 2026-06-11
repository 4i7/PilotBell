// Preflight for `npm run tauri:dev`.
//
// If a stale Vite instance (e.g. a leftover `npm run dev`, or a dev server
// leaked by a previously aborted `tauri dev`) is still listening on the dev
// port, the Vite spawned by Tauri's beforeDevCommand exits with
// "Port 1420 is already in use" (strictPort). The Tauri CLI then aborts with
// "The beforeDevCommand terminated with a non-zero status code" and kills the
// freshly built app, which surfaces as a confusing silent exit code 1.
// Fail fast here with an actionable message instead.

import net from "node:net";

const PORT = 1420;
// Vite may listen on IPv6 ::1 only (node resolves localhost to ::1 first on
// Windows), so probe both stacks.
const HOSTS = ["127.0.0.1", "::1"];

function probe(host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const free = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", free);
    socket.once("timeout", free);
  });
}

const results = await Promise.all(HOSTS.map(probe));

if (results.some(Boolean)) {
  console.error(
    [
      "",
      `[tauri:dev] Port ${PORT} is already in use.`,
      "A stale dev server (likely Vite from a previous `npm run dev` or an",
      "aborted `tauri dev`) is still running. If you continue, Tauri's",
      "beforeDevCommand will fail and the app will be killed with exit code 1.",
      "",
      "Find and stop it, then retry:",
      `  netstat -ano | findstr :${PORT}`,
      "  taskkill /PID <pid> /F",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
