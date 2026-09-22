import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

// Imports the built package, the same entry point consumers resolve.
import { buildHiveAuthOptions } from "../../dist/index.js";

const HIVE_URL = "https://hive.test";

const ENV_KEYS = [
    "NEXTAUTH_SECRET",
    "NEXT_PUBLIC_HIVE_URL",
    "HIVE_CLIENT_ID",
    "HIVE_CLIENT_SECRET",
    "NODE_ENV",
] as const;

let saved: Record<string, string | undefined>;
let captured: Array<string>;
let originalWarn: typeof console.warn;
let originalLog: typeof console.log;

beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.NEXTAUTH_SECRET = "test-secret";
    captured = [];
    originalWarn = console.warn;
    originalLog = console.log;
    console.warn = (...args: Array<unknown>) =>
        captured.push(args.map(String).join(" "));
    console.log = (...args: Array<unknown>) =>
        captured.push(args.map(String).join(" "));
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
    }
    console.warn = originalWarn;
    console.log = originalLog;
});

/** Pulls the Hive provider out of the built options. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function provider(config: Record<string, unknown> = {}): any {
    return buildHiveAuthOptions(config).providers[0];
}

describe("NEXTAUTH_SECRET guard", () => {
    test("throws when the secret is unset", () => {
        delete process.env.NEXTAUTH_SECRET;

        assert.throws(
            () => buildHiveAuthOptions({ hiveUrl: HIVE_URL }),
            /NEXTAUTH_SECRET environment variable is not set/,
        );
    });

    test("throws on an empty-string secret", () => {
        // An unset var and an empty one are the same failure: no signing key.
        process.env.NEXTAUTH_SECRET = "";

        assert.throws(() => buildHiveAuthOptions({ hiveUrl: HIVE_URL }));
    });

    test("returns options once the secret is set", () => {
        const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL });

        assert.ok(options.providers.length > 0);
        assert.ok(options.callbacks);
    });

    test("fires only after the provider is built, never on a partial result", () => {
        // The guard sits at the end of the factory, so a throw must leave the
        // caller with nothing rather than a half-configured options object.
        delete process.env.NEXTAUTH_SECRET;

        let result: unknown = "untouched";
        try {
            result = buildHiveAuthOptions({ hiveUrl: HIVE_URL });
        } catch {
            /* expected */
        }
        assert.equal(result, "untouched");
    });
});

describe("hiveUrl resolution and endpoint composition", () => {
    test("builds every OIDC endpoint off the configured base URL", () => {
        const hive = provider({ hiveUrl: HIVE_URL });

        assert.equal(
            hive.wellKnown,
            `${HIVE_URL}/api/core/sso/.well-known/openid-configuration`,
        );
        assert.equal(hive.issuer, `${HIVE_URL}/api/core/sso/`);
        assert.equal(hive.authorization.url, `${HIVE_URL}/api/core/sso/authorize/`);
        assert.equal(hive.token, `${HIVE_URL}/api/core/sso/token/`);
        assert.equal(hive.userinfo, `${HIVE_URL}/api/core/sso/userinfo/`);
    });

    test("strips a trailing slash so endpoints never double up", () => {
        // A double slash breaks OIDC discovery for every consumer, and the
        // env var is very easy to set with a trailing slash.
        const hive = provider({ hiveUrl: `${HIVE_URL}/` });

        assert.equal(hive.issuer, `${HIVE_URL}/api/core/sso/`);
        assert.ok(!hive.wellKnown.includes("//api"));
    });

    test("falls back to NEXT_PUBLIC_HIVE_URL", () => {
        process.env.NEXT_PUBLIC_HIVE_URL = "https://hive.env";

        assert.equal(provider().issuer, "https://hive.env/api/core/sso/");
    });

    test("strips a trailing slash on the env fallback too", () => {
        process.env.NEXT_PUBLIC_HIVE_URL = "https://hive.env/";

        assert.equal(provider().issuer, "https://hive.env/api/core/sso/");
    });

    test("prefers an explicit config value over the env var", () => {
        process.env.NEXT_PUBLIC_HIVE_URL = "https://hive.env";

        assert.equal(provider({ hiveUrl: HIVE_URL }).issuer, `${HIVE_URL}/api/core/sso/`);
    });

    test("defaults to an empty base when neither is set", () => {
        delete process.env.NEXT_PUBLIC_HIVE_URL;

        // Relative endpoints are useless but not a crash: the factory must not
        // throw here, because the URL is only needed at request time.
        assert.equal(provider().issuer, "/api/core/sso/");
    });

    test("strips only one trailing slash, so a doubled one still doubles up", () => {
        // Characterization, not endorsement. The regex is /\/$/ -- a single
        // pass -- so "https://hive.test//" normalizes to "https://hive.test/"
        // and the endpoints come out with "//api/core/sso/". Discovery would
        // break on that just as it would with no stripping at all. Pinned so
        // the limit is visible; tightening it to /\/+$/ is a deliberate change
        // that should fail this test and be made on purpose.
        assert.equal(
            provider({ hiveUrl: `${HIVE_URL}//` }).issuer,
            `${HIVE_URL}//api/core/sso/`,
        );
    });
});

describe("client credential resolution", () => {
    test("uses the configured client id and secret", () => {
        const hive = provider({
            hiveUrl: HIVE_URL,
            clientId: "cfg-id",
            clientSecret: "cfg-secret",
        });

        assert.equal(hive.clientId, "cfg-id");
        assert.equal(hive.clientSecret, "cfg-secret");
    });

    test("falls back to HIVE_CLIENT_ID and HIVE_CLIENT_SECRET", () => {
        process.env.HIVE_CLIENT_ID = "env-id";
        process.env.HIVE_CLIENT_SECRET = "env-secret";

        const hive = provider({ hiveUrl: HIVE_URL });

        assert.equal(hive.clientId, "env-id");
        assert.equal(hive.clientSecret, "env-secret");
    });

    test("config wins over env", () => {
        process.env.HIVE_CLIENT_ID = "env-id";

        assert.equal(provider({ hiveUrl: HIVE_URL, clientId: "cfg-id" }).clientId, "cfg-id");
    });

    test("keeps PKCE and state checks and body-posted credentials", () => {
        const hive = provider({ hiveUrl: HIVE_URL });

        assert.deepEqual(hive.checks, ["pkce", "state"]);
        assert.equal(hive.client.token_endpoint_auth_method, "client_secret_post");
        assert.match(hive.authorization.params.scope, /openid profile clearance/);
    });
});

describe("logger warn and debug branches", () => {
    test("warn prints the code", () => {
        const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL });

        options.logger!.warn!("NEXTAUTH_URL" as never);

        assert.ok(captured.some((line) => line.includes("NEXTAUTH_URL")));
        assert.ok(captured.some((line) => line.includes("NextAuth Warning")));
    });

    test("debug is absent entirely when debug mode is off", () => {
        // next-auth installs a noop `debug` and lets a supplied method
        // overwrite it, so handing it one unconditionally would make
        // `debug: false` inert and put profile/token payloads on stdout.
        const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL, debug: false });

        assert.equal(options.debug, false);
        assert.equal(options.logger!.debug, undefined);
    });

    test("debug logs the code and metadata outside production", () => {
        process.env.NODE_ENV = "development";
        const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL, debug: true });

        options.logger!.debug!("PROFILE_DATA", { profile: { sub: "42" } });

        const output = captured.join("\n");
        assert.ok(output.includes("PROFILE_DATA"));
        assert.ok(output.includes("42"));
    });

    test("debug withholds metadata in production even when forced on", () => {
        // Debugging a production incident must not put the provider token
        // response on stdout. The code name still logs; the payload does not.
        process.env.NODE_ENV = "production";
        const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL, debug: true });

        options.logger!.debug!("OAUTH_CALLBACK_RESPONSE", {
            access_token: "super-secret-token",
        });

        const output = captured.join("\n");
        assert.ok(output.includes("OAUTH_CALLBACK_RESPONSE"));
        assert.ok(
            !output.includes("super-secret-token"),
            "metadata must never reach production stdout",
        );
    });

    test("debug defaults to on outside production and off in production", () => {
        process.env.NODE_ENV = "development";
        assert.equal(buildHiveAuthOptions({ hiveUrl: HIVE_URL }).debug, true);

        process.env.NODE_ENV = "production";
        assert.equal(buildHiveAuthOptions({ hiveUrl: HIVE_URL }).debug, false);
    });
});
