import assert from "node:assert/strict";
import { beforeEach, describe, mock, test } from "node:test";

import { HiveClient, UserNotLoggedInError } from "@system-b90/hive-core";

const HIVE_URL = "https://hive.test";

const SESSION = {
    user: { id: "42", name: "Dana Cohen" },
    accessToken: "simple-access",
    refreshToken: "simple-refresh",
    expires: "2026-01-01",
};

/**
 * `createHiveClient` calls next-auth's `getServerSession` directly rather than
 * taking an injected getter, so the module is the only seam. It can be mocked
 * exactly once per process, so the stub reads mutable state that each test
 * sets instead of being re-registered per case.
 */
let currentSession: unknown = null;
let seenAuthOptions: Array<unknown> = [];

mock.module("next-auth", {
    namedExports: {
        getServerSession: async (options: unknown) => {
            seenAuthOptions.push(options);
            return currentSession;
        },
    },
});

const { createHiveClient } = await import("../../dist/index.js");

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

beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    currentSession = null;
    seenAuthOptions = [];
});

describe("createHiveClient", () => {
    test("throws UserNotLoggedInError when there is no session", async () => {
        currentSession = null;

        await assert.rejects(createHiveClient({} as never), (error: unknown) => {
            assert.ok(error instanceof UserNotLoggedInError);
            assert.match(error.message, /No active session found/);
            return true;
        });
    });

    test("delegates to createHiveClientFromSession on the happy path", async () => {
        currentSession = SESSION;
        const { SpyClient, calls } = spyCtor();

        const client = await createHiveClient({} as never, SpyClient, HIVE_URL);

        assert.ok(client instanceof HiveClient);
        assert.deepEqual(calls[0], ["simple-access", "simple-refresh", HIVE_URL]);
    });

    test("passes the authOptions it was given through to next-auth", async () => {
        currentSession = SESSION;
        const authOptions = { providers: [], secret: "s" };

        await createHiveClient(authOptions as never);

        assert.equal(seenAuthOptions.length, 1);
        assert.equal(seenAuthOptions[0], authOptions);
    });

    test("defaults to HiveClient when no constructor is injected", async () => {
        currentSession = SESSION;

        assert.ok((await createHiveClient({} as never)) instanceof HiveClient);
    });

    test("surfaces the missing-token error from a session with no accessToken", async () => {
        // A session can exist while its token does not -- the delegate's
        // guard, not this one's, is what rejects it.
        currentSession = { ...SESSION, accessToken: "" };

        await assert.rejects(createHiveClient({} as never), (error: unknown) => {
            assert.ok(error instanceof UserNotLoggedInError);
            assert.match(error.message, /access token is missing/);
            return true;
        });
    });

    test("does not construct a client when there is no session", async () => {
        currentSession = null;
        const { SpyClient, calls } = spyCtor();

        await assert.rejects(createHiveClient({} as never, SpyClient));
        assert.equal(calls.length, 0);
    });
});
