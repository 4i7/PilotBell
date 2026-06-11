# Dev troubleshooting

## `npm run tauri:dev` dies with exit code 1 right after the cargo build (no panic message)

**Symptom (observed 2026-06-10):** `tauri dev` builds successfully, then
`target\debug\pilotbell.exe` exits immediately with exit code 1 and no panic
output. Running the same exe directly with a separately started `npm run dev`
works fine.

**Root cause (reproduced):** a stale Vite dev server is still listening on
port 1420 — typically a leftover `npm run dev` started manually, or a Vite
instance leaked by a previously aborted `tauri dev`. The failure chain:

1. `tauri dev` sees `devUrl` (http://localhost:1420) already reachable (served
   by the *stale* Vite), so it proceeds straight to `cargo run`.
2. Its own `beforeDevCommand` (`npm run dev`) spawns a second Vite, which exits
   with `Error: Port 1420 is already in use` because `vite.config.ts` sets
   `strictPort: true`.
3. The Tauri CLI reacts with
   `Error The "beforeDevCommand" terminated with a non-zero status code.`
   and tears down its child job — the freshly built/launched app is terminated
   externally, which is why it shows exit code 1 with no panic message.
4. On some races the CLI exits while leaving `cargo`, `pilotbell.exe`, and/or
   the Vite process orphaned. The orphaned Vite keeps port 1420 occupied, so
   every subsequent `tauri dev` fails the same way ("consistently fails"),
   and the npm wrapper can appear to hang because the orphan inherits stdout.

The `Port 1420 is already in use` line is easy to miss: with a long cargo
rebuild it appears in the middle of the build output, far above the final
failure.

**Fix in this repo:** `npm run tauri:dev` now runs
[`scripts/check-dev-port.mjs`](../scripts/check-dev-port.mjs) first, which
fails fast with an actionable message when port 1420 is already occupied.

**Manual recovery:**

```powershell
netstat -ano | findstr :1420   # find the PID holding the port
taskkill /PID <pid> /F
# also check for orphans from an aborted run:
tasklist | findstr /I "pilotbell node cargo"
```

Verified with @tauri-apps/cli 2.11.2 / tauri 2.11.2 on Windows 11.

Note: the `tauri dev` file watcher is *not* the culprit — writes to
`src-tauri/gen/schemas/` are ignored by the watcher (tested), and a no-op
rebuild does not retrigger it.
