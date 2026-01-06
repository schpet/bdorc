import { blue, bold, magenta, red, yellow } from "@std/fmt/colors";

const PREFIX = "⎍";

/**
 * Print the Easy Bead Oven ASCII art banner
 */
export function printBanner(): void {
  const oven = magenta;
  const heat = yellow;
  const beads = blue;

  const lines = [
    oven("      ╭─────────────────────────╮"),
    oven("      │ ") + heat("░░░░░░░░░░░░░░░░░░░") + oven(" ╭─╮ │"),
    oven("      │ ") + heat("░") +
    oven("  ┌─────────────┐ ") + heat("░") + oven("│") + beads("●") +
    oven("│ │"),
    oven("      │ ") + heat("░") + oven("  │  ") + beads("○  ◌  ●") +
    oven("    │ ") + heat("░") + oven("├─┤ │"),
    oven("      │ ") + heat("░") + oven("  │    ") + beads("◯  ◉") +
    oven("     │ ") + heat("░") + oven("│") + beads("●") + oven("│ │"),
    oven("      │ ") + heat("░") + oven("  │  ") + beads("◌     ○") +
    oven("    │ ") + heat("░") + oven("├─┤ │"),
    oven("      │ ") + heat("░") +
    oven("  └─────────────┘ ") + heat("░") + oven("│") + beads("●") +
    oven("│ │"),
    oven("      │ ") + heat("░░░░░░░░░░░░░░░░░░░") + oven(" ╰─╯ │"),
    oven("      │▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│"),
    oven("      │   ") + bold("easy   bead   oven") + oven("    │"),
    oven("      ╰─────────────────────────╯"),
  ];

  for (const line of lines) {
    console.log(line);
  }
}

export function systemLog(message: string): void {
  console.log(`${blue(PREFIX)} ${bold(message)}`);
}

export function systemWarn(message: string): void {
  console.log(`${yellow(PREFIX)} ${bold(message)}`);
}

export function systemError(message: string): void {
  console.error(`${red(PREFIX)} ${bold(message)}`);
}
