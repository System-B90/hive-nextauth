import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

// Imports the built package, the same entry point consumers resolve.
import { HiveClient, UserNotLoggedInError } from "@system-b90/hive-core";
import {
    buildHiveAuthOptions,
    createHiveClientFromSession,
} from "../../dist/index.js";

const HIVE_URL = "https://hive.test";

const USER = {
    id: "42",
    name: "Dana Cohen",
    email: "dana@hive.test",
    username: "dana",
    clearance: 3,
    program: 7,
    gender: "Female",
    display_name: "Dana",
    is_teacher: true,
};

const TOKEN_DATA = {
    user: USER,
    accessToken: "simple-access",
    refreshToken: "simple-refresh",
    expires_at: 2_000_000_000,
};

beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function session(args: Record<string, unknown>): Promise<any> {
    const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (options.callbacks!.session as any)(args);
}

describe("session callback", () => {
    test("copies the user and access token onto the session", async () => {
        const result = await session({
            session: { expires: "2026-01-01" },
            token: { data: TOKEN_DATA },
        });

        assert.deepEqual(result.user, USER);
        assert.equal(result.accessToken, "simple-access");
        assert.equal(result.error, undefined);
        // `expires` is NextAuth's own field and must survive.
        assert.equal(result.expires, "2026-01-01");
    });

    test("propagates the expired flag alongside the user and token", async () => {
        const result = await session({
            session: {},
            token: { data: TOKEN_DATA, error: "TokenExpiredError" },
        });

        assert.equal(result.error, "TokenExpiredError");
        // The flag is the consumer's cue to force a re-login, but it still
        // needs the user to render anything while doing so.
        assert.deepEqual(result.user, USER);
        assert.equal(result.accessToken, "simple-access");
    });

    test("does not expose the refresh token to the client session", async () => {
        // Only accessToken is copied across. The refresh token stays in the
        // encrypted JWT, server-side.
        const result = await session({ session: {}, token: { data: TOKEN_DATA } });

        assert.equal(result.refreshToken, undefined);
    });

    test("returns the session untouched when the token has no data", async () => {
        const original = { expires: "2026-01-01", user: { name: "anon" } };

        const result = await session({ session: original, token: {} });

        assert.deepEqual(result, original);
        assert.equal(result.accessToken, undefined);
    });

    test("ignores an error flag when there is no token data", async () => {
        const result = await session({
            session: { expires: "2026-01-01" },
            token: { error: "TokenExpiredError" },
        });

        assert.equal(result.error, undefined);
    });

    test("ignores an unrecognised error code", async () => {
        const result = await session({
            session: {},
            token: { data: TOKEN_DATA, error: "SomeOtherError" },
        });

        // Only TokenExpiredError is forwarded; the session type allows nothing else.
        assert.equal(result.error, undefined);
    });
});

/** Records the positional arguments a client constructor receives. */
function spyCtor() {
    const calls: Array<Array<unknown>> = [];
    class SpyClient extends HiveClient {
        constructor(...args: Array<unknown>) {
            super(args[0] as string, args[1] as string, args[2] as string);
            calls.push(args);
        }
    }
    return { SpyClient, calls };
}

describe("createHiveClientFromSession", () => {
    const validSession = {
        user: USER,
        accessToken: "simple-access",
        refreshToken: "simple-refresh",
        expires: "2026-01-01",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    test("passes accessToken, refreshToken and hiveUrl positionally", () => {
        const { SpyClient, calls } = spyCtor();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createHiveClientFromSession(validSession, SpyClient as any, HIVE_URL);

        // Argument order is load-bearing and silent to break -- swapping the
        // first two yields a client that authenticates with a refresh token.
        assert.deepEqual(calls[0], ["simple-access", "simple-refresh", HIVE_URL]);
    });

    test("passes hiveUrl as undefined when omitted", () => {
        const { SpyClient, calls } = spyCtor();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createHiveClientFromSession(validSession, SpyClient as any);

        // The client then falls back to NEXT_PUBLIC_HIVE_URL itself.
        assert.deepEqual(calls[0], ["simple-access", "simple-refresh", undefined]);
    });

    test("defaults to HiveClient when no constructor is injected", () => {
        const client = createHiveClientFromSession(validSession);

        assert.ok(client instanceof HiveClient);
    });

    for (const [label, accessToken] of [
        ["missing", undefined],
        ["null", null],
        ["an empty string", ""],
    ] as Array<[string, unknown]>) {
        test(`throws UserNotLoggedInError when accessToken is ${label}`, () => {
            assert.throws(
                () =>
                    createHiveClientFromSession({
                        ...validSession,
                        accessToken,
                    }),
                (error: unknown) => {
                    assert.ok(error instanceof UserNotLoggedInError);
                    assert.match(error.message, /Unauthorized/);
                    return true;
                },
            );
        });
    }

    test("does not construct a client when the token is missing", () => {
        const { SpyClient, calls } = spyCtor();

        assert.throws(() =>
            createHiveClientFromSession(
                { ...validSession, accessToken: "" },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                SpyClient as any,
            ),
        );
        assert.equal(calls.length, 0);
    });

    test("tolerates a session with no refresh token", () => {
        const { SpyClient, calls } = spyCtor();

        createHiveClientFromSession(
            { ...validSession, refreshToken: undefined },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            SpyClient as any,
            HIVE_URL,
        );

        assert.deepEqual(calls[0], ["simple-access", undefined, HIVE_URL]);
    });
});
