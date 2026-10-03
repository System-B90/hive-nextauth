import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

// Imports the built package, the same entry point consumers resolve.
import {
    buildHiveAuthOptions,
    createHiveClientFromSession,
} from "../../dist/index.js";
import { HIVE_TEST_URL, HIVE_TEST_USERNAME, type TokenPair, tryLogin } from "./helpers.ts";

process.env.NEXTAUTH_SECRET ??= "integration-test-secret";

type OidcDiscovery = {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    scopes_supported?: Array<string>;
};

/** The provider object `buildHiveAuthOptions` wires against `HIVE_TEST_URL`. */
function hiveProvider() {
    const options = buildHiveAuthOptions({
        hiveUrl: HIVE_TEST_URL,
        clientId: "integration-test",
        clientSecret: "integration-test",
        debug: false,
    });
    return options.providers[0] as any;
}

describe("Hive SSO provider vs real Hive", () => {
    let tokens: TokenPair | undefined;
    let skipReason = "";

    before(async () => {
        ({ tokens, skipReason } = await tryLogin());
    });

    test("wellKnown discovery document is served and matches the provider's endpoints", async (t) => {
        if (!tokens) return t.skip(skipReason);
        const provider = hiveProvider();

        const response = await fetch(provider.wellKnown, { signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200, `GET ${provider.wellKnown}`);
        const discovery = (await response.json()) as OidcDiscovery;

        // Path-only comparison: Hive may advertise its public origin, which
        // differs from HIVE_TEST_URL when tests reach it through an alias.
        const path = (url: string) => new URL(url).pathname.replace(/\/?$/, "/");
        assert.equal(path(discovery.issuer), path(provider.issuer));
        assert.equal(path(discovery.authorization_endpoint), path(provider.authorization.url));
        assert.equal(path(discovery.token_endpoint), path(provider.token));
        assert.equal(path(discovery.userinfo_endpoint), path(provider.userinfo));
    });

    test("every scope the provider requests is supported by Hive", async (t) => {
        if (!tokens) return t.skip(skipReason);
        const provider = hiveProvider();

        const discovery = (await (await fetch(provider.wellKnown)).json()) as OidcDiscovery;
        if (!discovery.scopes_supported) return t.skip("Hive does not advertise scopes_supported");
        for (const scope of String(provider.authorization.params.scope).split(/\s+/)) {
            assert.ok(discovery.scopes_supported.includes(scope), `scope "${scope}" not supported`);
        }
    });

    test("jwt callback rejects sign-in when Hive refuses the token exchange", async (t) => {
        if (!tokens) return t.skip(skipReason);
        const jwt = buildHiveAuthOptions({
            hiveUrl: HIVE_TEST_URL,
            clientId: "integration-test",
            clientSecret: "integration-test",
            debug: false,
        }).callbacks!.jwt!;

        await assert.rejects(
            jwt({
                token: {},
                user: { id: "1", clearance: 4 },
                account: {
                    provider: "hive",
                    type: "oauth",
                    providerAccountId: "1",
                    access_token: "not-a-real-dot-token",
                },
            } as any),
            /token exchange\. Hive responded with status 4\d\d/,
        );
    });

    test("createHiveClientFromSession builds a client that talks to Hive as the session user", async (t) => {
        if (!tokens) return t.skip(skipReason);

        const client = createHiveClientFromSession(
            {
                accessToken: tokens.access,
                refreshToken: tokens.refresh,
            } as any,
            undefined,
            HIVE_TEST_URL,
        );
        const me = await client.me.get();
        assert.equal(me.username, HIVE_TEST_USERNAME);
    });
});
