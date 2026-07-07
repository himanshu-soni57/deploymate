import pc from "picocolors";

class Logger {
  info(message: string): void {
    console.log(pc.cyan("ℹ"), message);
  }

  success(message: string): void {
    console.log(pc.green("✔"), message);
  }

  warn(message: string): void {
    console.log(pc.yellow("⚠"), message);
  }

  error(message: string): void {
    console.log(pc.red("✖"), message);
  }
}

export const log = new Logger();
