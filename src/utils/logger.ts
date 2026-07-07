import pc from "picocolors";

export const log = {
  info(message: string) {
    console.log(pc.cyan("ℹ"), message);
  },

  success(message: string) {
    console.log(pc.green("✔"), message);
  },

  error(message: string) {
    console.log(pc.red("✖"), message);
  },

  warn(message: string) {
    console.log(pc.yellow("⚠"), message);
  },
};
