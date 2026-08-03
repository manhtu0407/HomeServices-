// Shared so HTTP parsing and domain workflows can raise typed failures without importing upward.
export class ApiFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function apiFailure(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): never {
  throw new ApiFailure(code, message, status, extra);
}
