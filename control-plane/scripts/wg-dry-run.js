# WireGuard wrapper that logs instead of executing.
# Use as: DRY_RUN=1 (built into WireGuardManager) — or symlink this as a fake `wg`
# by pointing WG_BIN at it. Simpler: run with DRY_RUN=1, no wrapper needed.
#!/usr/bin/env node
console.log("[wg-dry-run]", process.argv.slice(2).join(" "));
