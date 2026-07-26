export class GingrIntegrationError extends Error {
  code: string;
  status?: number;
  constructor(message: string, code = "gingr_error", status?: number) {
    super(message);
    this.name = "GingrIntegrationError";
    this.code = code;
    this.status = status;
  }
}

export class GingrAuthError extends GingrIntegrationError {
  constructor(message = "Gingr API authentication failed.") {
    super(message, "gingr_auth", 401);
    this.name = "GingrAuthError";
  }
}

export class GingrRateLimitError extends GingrIntegrationError {
  constructor(message = "Gingr API rate limit exceeded.") {
    super(message, "gingr_rate_limit", 429);
    this.name = "GingrRateLimitError";
  }
}
