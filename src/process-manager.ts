/**
 * Process manager - tracks child processes and handles cleanup on signals
 */

import { dim, red, yellow } from "@std/fmt/colors";

interface TrackedProcess {
  process: Deno.ChildProcess;
  name: string;
  pid: number;
}

const childProcesses = new Map<Deno.ChildProcess, TrackedProcess>();
let signalHandlersInstalled = false;
let isShuttingDown = false;

function log(message: string): void {
  console.error(dim(`[process-manager] ${message}`));
}

function logWarn(message: string): void {
  console.error(yellow(`[process-manager] ${message}`));
}

function logError(message: string): void {
  console.error(red(`[process-manager] ${message}`));
}

/**
 * Register a child process for cleanup tracking
 */
export function registerProcess(
  process: Deno.ChildProcess,
  name = "unknown",
): void {
  const pid = process.pid;
  childProcesses.set(process, { process, name, pid });
  log(`registered process: ${name} (pid=${pid})`);
}

/**
 * Unregister a child process (call when it exits normally)
 */
export function unregisterProcess(process: Deno.ChildProcess): void {
  const tracked = childProcesses.get(process);
  if (tracked) {
    log(`unregistered process: ${tracked.name} (pid=${tracked.pid})`);
    childProcesses.delete(process);
  }
}

/**
 * Kill all registered child processes and wait for them to exit
 */
export async function killAllProcesses(): Promise<void> {
  const count = childProcesses.size;
  if (count === 0) {
    log("no child processes to kill");
    return;
  }

  logWarn(`sending SIGTERM to ${count} child process(es)...`);

  const exitPromises: Promise<void>[] = [];

  for (const [process, tracked] of childProcesses) {
    try {
      log(`sending SIGTERM to ${tracked.name} (pid=${tracked.pid})`);
      process.kill("SIGTERM");

      // Wait for process to exit with a timeout
      const exitPromise = (async () => {
        try {
          const timeoutMs = 5000;
          const status = await Promise.race([
            process.status,
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), timeoutMs)
            ),
          ]);

          if (status === null) {
            logWarn(
              `${tracked.name} (pid=${tracked.pid}) did not exit within ${timeoutMs}ms, sending SIGKILL`,
            );
            try {
              process.kill("SIGKILL");
              await process.status;
              log(`${tracked.name} (pid=${tracked.pid}) killed with SIGKILL`);
            } catch {
              // Already dead
            }
          } else {
            log(
              `${tracked.name} (pid=${tracked.pid}) exited with code ${status.code}`,
            );
          }
        } catch {
          log(`${tracked.name} (pid=${tracked.pid}) already exited`);
        }
      })();

      exitPromises.push(exitPromise);
    } catch {
      log(`${tracked.name} (pid=${tracked.pid}) already exited`);
    }
  }

  // Wait for all processes to exit
  await Promise.all(exitPromises);

  childProcesses.clear();
  log("all child processes terminated");
}

/**
 * Kill all registered child processes synchronously (for signal handler)
 * This is a fire-and-forget version that doesn't wait
 */
function killAllProcessesSync(): void {
  const count = childProcesses.size;
  if (count === 0) {
    log("no child processes to kill");
    return;
  }

  logWarn(`sending SIGTERM to ${count} child process(es)...`);

  for (const [process, tracked] of childProcesses) {
    try {
      log(`sending SIGTERM to ${tracked.name} (pid=${tracked.pid})`);
      process.kill("SIGTERM");
    } catch {
      log(`${tracked.name} (pid=${tracked.pid}) already exited`);
    }
  }

  childProcesses.clear();
}

/**
 * Check if shutdown is in progress
 */
export function isShuttingDownFlag(): boolean {
  return isShuttingDown;
}

/**
 * Install signal handlers for graceful shutdown.
 * Call this once at program startup.
 */
export function installSignalHandlers(): void {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;

  log("signal handlers installed");

  const handleSignal = (signal: string) => {
    if (isShuttingDown) {
      // Second signal - force exit
      logError(`received ${signal} again, forcing exit...`);
      Deno.exit(130);
    }

    isShuttingDown = true;
    logWarn(`received ${signal}, shutting down...`);

    // Kill all child processes (sync version since we're in a signal handler)
    killAllProcessesSync();

    // Exit with appropriate code (128 + signal number)
    // SIGINT = 2, SIGTERM = 15
    const exitCode = signal === "SIGINT" ? 130 : 143;
    log(`exiting with code ${exitCode}`);
    Deno.exit(exitCode);
  };

  // Handle SIGINT (Ctrl+C)
  try {
    const sigint = Deno.addSignalListener(
      "SIGINT",
      () => handleSignal("SIGINT"),
    );
    // Store reference to prevent GC (not strictly necessary but good practice)
    void sigint;
  } catch {
    // Signal handling may not be available on all platforms
  }

  // Handle SIGTERM
  try {
    const sigterm = Deno.addSignalListener(
      "SIGTERM",
      () => handleSignal("SIGTERM"),
    );
    void sigterm;
  } catch {
    // Signal handling may not be available on all platforms
  }
}
