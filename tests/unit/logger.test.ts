import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

// Imports the built package, the same entry point consumers resolve.
import { buildHiveAuthOptions } from "../../dist/index.js";

const HIVE_URL = "https://hive.test";

let captured: Array<string>;
let originalError: typeof console.error;
let originalLog: typeof console.log;
let originalNodeEnv: string | undefined;

beforeEach(() => {
    captured = [];
    originalError = console.error;
    console.error = (...args: Array<unknown>) => {
        captured.push(args.map(String).join(" "));
    };
    originalLog = console.log;
    console.log = (...args: Array<unknown>) => {
        captured.push(args.map(String).join(" "));
    };
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NEXTAUTH_SECRET = "test-secret";
});

afterEach(() => {
    console.error = originalError;
    console.log = originalLog;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
});

function logError(metadata: unknown, nodeEnv: string) {
    process.env.NODE_ENV = nodeEnv;
    const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL });
    options.logger!.error!("SIGNIN_OAUTH_ERROR", metadata as never);
    return captured.join("\n");
}

describe("NextAuth error logging", () => {
    test("reports the cause in production", () => {
        // The regression this covers: a CI run failed on SIGNIN_OAUTH_ERROR
        // with nothing in the log but the Hive URL, because `next start` runs
        // in production and the whole metadata dump was suppressed there.
        const out = logError(
            { error: new Error("connect ECONNREFUSED 10.0.0.1:443") },
            "production",
        );

        assert.match(out, /SIGNIN_OAUTH_ERROR/);
        assert.match(out, /Cause: Error: connect ECONNREFUSED/);
        assert.match(out, /Hive URL: https:\/\/hive\.test/);
    });

    test("still withholds the full metadata object in production", () => {
        // The object around the error can carry the provider response, and
        // therefore tokens. Only the name and message are safe.
        const out = logError(
            {
                error: new Error("boom"),
                providerResponse: { access_token: "SECRET-TOKEN-VALUE" },
            },
            "production",
        );

        assert.match(out, /Cause: Error: boom/);
        assert.doesNotMatch(out, /SECRET-TOKEN-VALUE/);
    });

    test("dumps the full metadata outside production", () => {
        const out = logError({ error: new Error("boom"), detail: "extra" }, "development");

        assert.match(out, /Cause: Error: boom/);
        assert.match(out, /"detail": "extra"/);
    });

    test("handles a bare Error as the metadata", () => {
        const out = logError(new Error("bare failure"), "production");

        assert.match(out, /Cause: Error: bare failure/);
    });

    test("handles a string error field", () => {
        const out = logError({ error: "invalid_client" }, "production");

        assert.match(out, /Cause: invalid_client/);
    });

    test("says nothing extra when there is no cause to report", () => {
        const out = logError({ provider: "hive" }, "production");

        assert.doesNotMatch(out, /Cause:/);
        assert.match(out, /Hive URL/);
    });
});

describe("NextAuth debug logging (#9)", () => {
    function optionsFor(nodeEnv: string, debug?: boolean) {
        process.env.NODE_ENV = nodeEnv;
        return buildHiveAuthOptions({ hiveUrl: HIVE_URL, ...(debug === undefined ? {} : { debug }) });
    }

    test("supplies no debug method in production", () => {
        // next-auth installs a noop `debug` when the `debug` option is false,
        // then lets a supplied method overwrite it. Supplying one
        // unconditionally is what made `debug: false` inert, so the fix is
        // that there is nothing here to overwrite the noop with.
        assert.equal(optionsFor("production").logger!.debug, undefined);
    });

    test("supplies no debug method when the caller passes debug: false", () => {
        assert.equal(optionsFor("development", false).logger!.debug, undefined);
    });

    test("supplies a debug method outside production", () => {
        assert.equal(typeof optionsFor("development").logger!.debug, "function");
    });

    test("dumps metadata outside production", () => {
        const options = optionsFor("development");
        options.logger!.debug!("PROFILE_DATA", { profile: { username: "someone" } } as never);

        const out = captured.join("\n");
        assert.match(out, /PROFILE_DATA/);
        assert.match(out, /"username": "someone"/);
    });

    test("withholds metadata if debug is forced on in production", () => {
        // Belt and braces: a caller can pass `debug: true` explicitly, and the
        // payloads this guards against (PROFILE_DATA, OAUTH_CALLBACK_RESPONSE)
        // are exactly the ones carrying tokens and PII.
        const options = optionsFor("production", true);
        options.logger!.debug!("OAUTH_CALLBACK_RESPONSE", {
            access_token: "SECRET-TOKEN-VALUE",
        } as never);

        const out = captured.join("\n");
        assert.match(out, /OAUTH_CALLBACK_RESPONSE/);
        assert.doesNotMatch(out, /SECRET-TOKEN-VALUE/);
    });
});
