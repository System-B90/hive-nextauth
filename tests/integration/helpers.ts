/*
 * Shared setup for integration tests against a real Hive. In CI,
 * `integration.yml` takes the persistent shared Hive at https://hive.org via
 * System-B90/.github's `shared-hive-acquire` (self-signed cert, so tests run
 * with NODE_TLS_REJECT_UNAUTHORIZED=0) whose baseline superuser is
 * admin/Password1. Locally the same defaults apply; when nothing usable
 * answers at HIVE_TEST_URL every suite skips instead of failing, so
 * `npm test` stays green without a Hive stack.
 */

export const HIVE_TEST_URL = (process.env.HIVE_TEST_URL ?? "https://hive.org").replace(/\/$/, "");
export const HIVE_TEST_USERNAME = process.env.HIVE_TEST_USERNAME ?? "admin";
const HIVE_TEST_PASSWORD = process.env.HIVE_TEST_PASSWORD ?? "Password1";

export type TokenPair = { access: string; refresh: string };

/** Logs in with the Resource Owner Password flow (`POST /api/core/token/`). */
export async function login(): Promise<TokenPair> {
    const response = await fetch(`${HIVE_TEST_URL}/api/core/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: HIVE_TEST_USERNAME,
            password: HIVE_TEST_PASSWORD,
        }),
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
        throw new Error(`Hive login failed: HTTP ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as TokenPair;
}

/** Login doubles as the reachability probe; returns tokens or a skip reason. */
export async function tryLogin(): Promise<{ tokens?: TokenPair; skipReason: string }> {
    try {
        return { tokens: await login(), skipReason: "" };
    } catch (error) {
        // CI sets this so an unreachable Hive fails the run instead of
        // silently skipping every test.
        if (process.env.HIVE_INTEGRATION_REQUIRED) throw error;
        return {
            skipReason: `Hive not usable at ${HIVE_TEST_URL}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }
}
