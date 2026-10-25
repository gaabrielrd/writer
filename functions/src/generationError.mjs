/** Public error identity without I/O; generation.mjs keeps its historical export. */
export class GenerationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
