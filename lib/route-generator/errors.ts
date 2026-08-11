/** Typed client/validation errors for Route Generator API responses. */
export class RouteGeneratorClientError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "route_generator_error") {
    super(message);
    this.name = "RouteGeneratorClientError";
    this.status = status;
    this.code = code;
  }
}

export function isRouteGeneratorClientError(error: unknown): error is RouteGeneratorClientError {
  return error instanceof RouteGeneratorClientError;
}
