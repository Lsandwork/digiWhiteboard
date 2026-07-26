import { fitdogEmployeeEmail, fitdogEmployeePassword, fitdogOauthClientId, fitdogOauthClientSecret } from "@/lib/fitdog-ops/config";

const FITDOG_API_HOST = "https://api1-prod.fitdog.com";

export type FitdogOAuthToken = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

/**
 * Password-grant against Fitdog's public web OAuth client (same client the SPA uses).
 * Avoids launching Chromium for alert sync.
 */
export async function fetchFitdogEmployeeAccessToken(): Promise<FitdogOAuthToken> {
  const username = fitdogEmployeeEmail()?.toLowerCase() || null;
  const password = fitdogEmployeePassword();
  const clientId = fitdogOauthClientId();
  const clientSecret = fitdogOauthClientSecret();
  if (!username || !password) {
    throw new Error("FITDOG_EMPLOYEE_EMAIL and FITDOG_EMPLOYEE_PASSWORD are required.");
  }
  if (!clientId || !clientSecret) {
    throw new Error("FITDOG_OAUTH_CLIENT_ID and FITDOG_OAUTH_CLIENT_SECRET are required.");
  }

  const body = new FormData();
  body.set("username", username);
  body.set("password", password);
  body.set("grant_type", "password");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await fetch(`${FITDOG_API_HOST}/api/oauth/token/`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://app.fitdog.com/"
    },
    body
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Fitdog OAuth failed (${response.status}). Check employee credentials.`);
  }
  const json = JSON.parse(text) as FitdogOAuthToken;
  if (!json.access_token) throw new Error("Fitdog OAuth response missing access_token.");
  return json;
}

export async function fetchFitdogActivityStream(accessToken: string, pageSize = 100) {
  const response = await fetch(
    `${FITDOG_API_HOST}/api/v1/employees/activity-stream/?page_size=${Math.max(1, Math.min(200, pageSize))}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Fitdog activity-stream failed (${response.status}).`);
  }
  const json = JSON.parse(text) as {
    count?: number;
    results?: Array<{
      id: number | string;
      description?: string;
      timestamp?: string;
      created_at?: string;
      url?: string | null;
    }>;
  };
  return json.results || [];
}

export { FITDOG_API_HOST };
