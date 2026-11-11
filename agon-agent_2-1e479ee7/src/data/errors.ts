/** Errors raised by data sources, already phrased for display to the user. */
export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/** A uniqueness rule was violated. `field` names the form field at fault, if known. */
export class ConflictError extends RepositoryError {
  readonly field: string | null;

  constructor(message: string, field: string | null = null) {
    super(message);
    this.name = 'ConflictError';
    this.field = field;
  }
}

export class NotFoundError extends RepositoryError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** The data source rejected the input. `fieldErrors` maps form fields to messages. */
export class InvalidInputError extends RepositoryError {
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'InvalidInputError';
    this.fieldErrors = fieldErrors;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Something went wrong. Please try again.';
}
