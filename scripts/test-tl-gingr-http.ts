import assert from "node:assert/strict";
import { fetchTlGingrResponse } from "../lib/tl-digi-board/gingr-http";

const originalFetch = globalThis.fetch;

async function run() {
  globalThis.fetch = (async (_url, init) => {
    return await new Promise((_resolve, reject) => {
      const signal = init?.signal;
      const abort = () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      fetchTlGingrResponse(
        "https://fitdog.gingrapp.com/api/v1/get_medication_info?key=SUPER_SECRET_KEY&animal_id=1",
        { method: "GET" },
        "Gingr get_medication_info",
        25
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /timed out after 25ms/);
      assert.doesNotMatch(error.message, /SUPER_SECRET_KEY/);
      assert.doesNotMatch(error.message, /gingrapp\.com/);
      assert.doesNotMatch(error.message, /get_medication_info\?key/);
      return true;
    }
  );

  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  await assert.rejects(
    () =>
      fetchTlGingrResponse(
        "https://fitdog.gingrapp.com/api/v1/reservations?key=SUPER_SECRET_KEY",
        { method: "POST" },
        "Gingr reservations",
        25
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Gingr reservations failed/);
      assert.doesNotMatch(error.message, /SUPER_SECRET_KEY/);
      return true;
    }
  );
}

run()
  .then(() => {
    console.log("test-tl-gingr-http: ok");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });
