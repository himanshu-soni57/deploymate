#!/usr/bin/env node

import { Command } from "commander";
import { deploy } from "./commands/deploy";
import { handleError } from "./utils/error";

const program = new Command();

program
  .name("deploymate")
  .description("Deploy GitHub Actions projects with ease.")
  .version("0.1.0");

program
  .command("deploy")
  .description("Deploy current repository")
  .action(deploy);

async function bootstrap() {
  try {
    await program.parseAsync();
  } catch (error) {
    handleError(error);
  }
}

await bootstrap();
