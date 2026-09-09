import pc from "picocolors";

export type LogLevel = "silent" | "normal" | "verbose";

class Logger {
  level: LogLevel = "normal";
  /** When true, human-readable output is suppressed in favour of JSON. */
  json = false;

  private out(line: string): void {
    if (this.level === "silent" || this.json) return;
    console.log(line);
  }

  info(message: string): void {
    this.out(`${pc.cyan("i")} ${message}`);
  }

  success(message: string): void {
    this.out(`${pc.green("*")} ${message}`);
  }

  warn(message: string): void {
    this.out(`${pc.yellow("!")} ${message}`);
  }

  error(message: string): void {
    if (this.json) return;
    console.error(`${pc.red("x")} ${message}`);
  }

  step(message: string): void {
    this.out(`${pc.dim("|")} ${message}`);
  }

  plain(message = ""): void {
    this.out(message);
  }

  dim(message: string): void {
    this.out(pc.dim(message));
  }

  debug(message: string): void {
    if (this.level !== "verbose") return;
    console.log(`${pc.magenta("debug")} ${pc.dim(message)}`);
  }

  /** Prints an intent instead of an action, used by --dry-run. */
  dryRun(message: string): void {
    this.out(`${pc.yellow("dry-run")} ${message}`);
  }

  heading(message: string): void {
    this.out("");
    this.out(pc.bold(message));
  }
}

export const log = new Logger();
