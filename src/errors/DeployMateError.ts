export class DeployMateError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "DeployMateError";
  }
}
