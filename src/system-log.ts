import { blue, bold, red, yellow } from "@std/fmt/colors";

const PREFIX = "⎍";

export function systemLog(message: string): void {
  console.log(`${blue(PREFIX)} ${bold(message)}`);
}

export function systemWarn(message: string): void {
  console.log(`${yellow(PREFIX)} ${bold(message)}`);
}

export function systemError(message: string): void {
  console.error(`${red(PREFIX)} ${bold(message)}`);
}
