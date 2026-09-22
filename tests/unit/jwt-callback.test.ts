import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";

// Imports the built package, the same entry point consumers resolve.
import { buildHiveAuthOptions } from "../../dist/index.js";

const HIVE_URL = "https://hive.test";

type Call = { url: string; init?: RequestInit };

/** Replaces global fetch and records the exchange call. */
function stubFetch(
    reply: { status?: number; body?: unknown } | Error,
): Array<Call> {
    const calls: Array<Call> = [];
    mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (reply instanceof Error) throw reply;
        const { status = 200, body = {} } = reply;
        return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    });
    return calls;
}

const HIVE_USER = {
    id: "42",
    name: "Dana Cohen",
    email: "dana@hive.test",
    username: "dana",
    clearance: 3,
    program: 7,
    gender: "F",
    display_name: "Dana",
    is_teacher: true,
};

const EXCHANGE_BODY = {
    access_token: "simple-access",
    refresh_token: "simple-refresh",
    expires_at: 2_000_000_000,
};

/** Invokes the jwt callback the way NextAuth would. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jwt(args: Record<string, unknown>): Promise<any> {
    const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (options.callbacks!.jwt as any)(args);
}

let originalError: typeof console.error;
let logged: Array<string>;

beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    logged = [];
    originalError = console.error;
    console.error = (...args: Array<unknown>) => {
        logged.push(args.map(String).join(" "));
    };
});

afterEach(() => {
    console.error = originalError;
    mock.restoreAll();
});

describe("jwt callback: first sign-in exchange", () => {
    test("POSTs the DOT token to the exchange endpoint as a bearer", async () => {
        const calls = stubFetch({ body: EXCHANGE_BODY });

        await jwt({
            token: {},
            user: HIVE_USER,
            account: { access_token: "dot-token" },
        });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, `${HIVE_URL}/api/core/sso/exchange/`);
        assert.equal(calls[0].init?.method, "POST");
        const headers = new Headers(calls[0].init?.headers);
        assert.equal(headers.get("Authorization"), "Bearer dot-token");
        assert.equal(headers.get("Content-Type"), "application/json");
    });

    test("stores the SimpleJWT pair and expiry from the exchange response", async () => {
        stubFetch({ body: EXCHANGE_BODY });

        const token = await jwt({
            token: {},
            user: HIVE_USER,
            account: { access_token: "dot-token" },
        });

        assert.equal(token.data.accessToken, "simple-access");
        assert.equal(token.data.refreshToken, "simple-refresh");
        assert.equal(token.data.expires_at, 2_000_000_000);
        assert.equal(token.error, undefined);
    });

    test("copies the user snapshot field by field", async () => {
        stubFetch({ body: EXCHANGE_BODY });

        const token = await jwt({
            token: {},
            user: { ...HIVE_USER, temp_access_token: "should-not-survive" },
            account: { access_token: "dot-token" },
        });

        assert.deepEqual(token.data.user, HIVE_USER);
        // The snapshot is an explicit field list, not a spread: the temp_*
        // fields NextAuth carries on the user must not reach the session.
        assert.equal("temp_access_token" in token.data.user, false);
    });
});

describe("jwt callback: exchange failure rejects sign-in", () => {
    test("throws on a non-ok exchange response and logs the cause", async () => {
        stubFetch({ status: 500 });

        await assert.rejects(
            jwt({ token: {}, user: HIVE_USER, account: { access_token: "dot" } }),
            /Authentication failed during token exchange\./,
        );
        assert.ok(
            logged.some(
                (line) =>
                    line.includes("SSO Token Exchange Error:") &&
                    line.includes("500"),
            ),
            "the upstream status should be logged",
        );
    });

    test("throws when the exchange request itself rejects", async () => {
        stubFetch(new TypeError("fetch failed"));

        await assert.rejects(
            jwt({ token: {}, user: HIVE_USER, account: { access_token: "dot" } }),
            /Authentication failed during token exchange\./,
        );
        assert.ok(logged.some((line) => line.includes("SSO Token Exchange Error:")));
    });

    test("never mints a token when the exchange fails", async () => {
        stubFetch({ status: 403 });
        const token: Record<string, unknown> = {};

        await assert.rejects(
            jwt({ token, user: HIVE_USER, account: { access_token: "dot" } }),
        );

        // Sign-in is rejected outright -- no degraded token is returned.
        assert.equal(token.data, undefined);
    });
});

describe("jwt callback: expiry propagation on later requests", () => {
    const tokenWith = (expiresAt: number) => ({
        data: {
            user: HIVE_USER,
            accessToken: "simple-access",
            refreshToken: "simple-refresh",
            expires_at: expiresAt,
        },
    });

    test("flags an expired token while preserving its data", async () => {
        const past = Math.floor(Date.now() / 1000) - 60;

        const token = await jwt({ token: tokenWith(past) });

        assert.equal(token.error, "TokenExpiredError");
        // The stale tokens stay on the token; the error flag is the only
        // signal consumers get, and they need the data to identify the user.
        assert.equal(token.data.accessToken, "simple-access");
        assert.deepEqual(token.data.user, HIVE_USER);
    });

    test("leaves an unexpired token untouched", async () => {
        const future = Math.floor(Date.now() / 1000) + 3600;

        const token = await jwt({ token: tokenWith(future) });

        assert.equal(token.error, undefined);
        assert.equal(token.data.accessToken, "simple-access");
    });

    test("treats expires_at exactly equal to now as not expired", async () => {
        // The comparison is a strict `<`, so the boundary second is still
        // valid. Pinned because flipping it to `<=` would log every consumer
        // out one second early on every request that lands on the boundary.
        const now = 1_700_000_000_000;
        const clock = mock.method(Date, "now", () => now);

        const token = await jwt({ token: tokenWith(now / 1000) });

        assert.equal(token.error, undefined);
        clock.mock.restore();
    });

    test("flags a token one millisecond past its expiry", async () => {
        const now = 1_700_000_000_001;
        const clock = mock.method(Date, "now", () => now);

        const token = await jwt({ token: tokenWith(1_700_000_000_000 / 1000) });

        assert.equal(token.error, "TokenExpiredError");
        clock.mock.restore();
    });

    test("returns a token with no data unchanged", async () => {
        const calls = stubFetch({ body: EXCHANGE_BODY });

        const token = await jwt({ token: { sub: "42" } });

        assert.deepEqual(token, { sub: "42" });
        assert.equal(token.error, undefined);
        // Nothing to exchange, so nothing should be requested.
        assert.equal(calls.length, 0);
    });

    test("does not exchange when only `user` is present without `account`", async () => {
        // `account` is set only on the very first sign-in step; a user without
        // one must not trigger a second exchange.
        const calls = stubFetch({ body: EXCHANGE_BODY });

        await jwt({ token: {}, user: HIVE_USER });

        assert.equal(calls.length, 0);
    });
});
