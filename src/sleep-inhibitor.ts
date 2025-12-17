import { systemWarn } from "./system-log.ts";
import { registerProcess, unregisterProcess } from "./process-manager.ts";

export interface SleepInhibitor {
  enable(): void;
  disable(): void;
}

let windowsWarningShown = false;

/**
 * Create a sleep inhibitor that spawns platform-specific commands to prevent idle sleep.
 *
 * - macOS: uses `caffeinate -i`
 * - Linux: uses `systemd-inhibit`
 * - Windows: logs a warning (not supported)
 */
export function createSleepInhibitor(): SleepInhibitor {
  let process: Deno.ChildProcess | null = null;

  return {
    enable() {
      if (process) return;

      const os = Deno.build.os;
      if (os === "darwin") {
        try {
          process = new Deno.Command("caffeinate", { args: ["-i"] }).spawn();
          registerProcess(process, "caffeinate");
        } catch {
          // Ignore - caffeinate may not be available
        }
      } else if (os === "linux") {
        try {
          process = new Deno.Command("systemd-inhibit", {
            args: [
              "--what=sleep:idle",
              "--who=ebo",
              "--why=Working on issues",
              "sleep",
              "infinity",
            ],
          }).spawn();
          registerProcess(process, "systemd-inhibit");
        } catch {
          // Ignore - systemd-inhibit may not be available
        }
      } else if (os === "windows" && !windowsWarningShown) {
        systemWarn("Sleep prevention not supported on Windows");
        windowsWarningShown = true;
      }
    },

    disable() {
      if (!process) return;
      try {
        unregisterProcess(process);
        process.kill();
      } catch {
        // Ignore - process may have already exited
      }
      process = null;
    },
  };
}
