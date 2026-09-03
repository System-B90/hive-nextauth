/*
 * NextAuth Hive OIDC provider + callbacks, extracted from Bluz
 * `api-server/hive/sso.ts` (the most evolved copy: token-expiry propagation,
 * PII-safe logger, NEXTAUTH_SECRET guard) as a configurable factory.
 */

import { Clearance, GenderEnum } from "@system-b90/hive-core";
import { AuthOptions, CallbacksOptions, Profile } from "next-auth";
import { OAuthConfig } from "next-auth/providers/index";

import { AuthSessionData } from "./session.js";

type JwtTokenData = {
    user: HiveUser;
    accessToken: string;
    refreshToken: string;
    expires_at: number;
};

export type HiveSsoProfile = {
    sub: string;
    aud: string;
    iat: number;
    at_hash: string;
    preferred_username: string;
    gender: GenderEnum;
    given_name: string;
    family_name: string;
    picture?: null | string;
    number: null | number;
    clearance: number;
    program: null | number;
    program_name: null | string;
    is_teacher: boolean;
    username: string;
    display_name: string;
    mentor: null | number;
    email?: string;
    iss: string;
    exp: number;
    auth_time: number;
    jti: string;
    api_token?: {
        access_token: string;
        refresh_token: string;
        expires_at: number;
    };
} & Profile;

export type HiveUser = {
    id: string;
    name: string;
    email: null | string;
    username: string;
    clearance: number;
    program: null | number;
    gender: GenderEnum;
    display_name: string;
    is_teacher: boolean;
    temp_access_token?: string;
    temp_refresh_token?: string;
    temp_expires_at?: number;
};

export type HiveAuthConfig = {
    /** Hive base URL. Defaults to `NEXT_PUBLIC_HIVE_URL`. */
    hiveUrl?: string;
    /** OAuth client id. Defaults to `HIVE_CLIENT_ID`. */
    clientId?: string;
    /** OAuth client secret. Defaults to `HIVE_CLIENT_SECRET`. */
    clientSecret?: string;
    /** Clearance levels allowed to sign in. Defaults to Segel + Admin. */
    allowedClearances?: Array<Clearance>;
    /** Sign-in page route. Defaults to `/login`. */
    signInPage?: string;
    /** NextAuth debug logging. Defaults to `NODE_ENV !== "production"`. */
    debug?: boolean;
};

/**
 * Pulls a human-readable cause out of NextAuth's error metadata.
 *
 * NextAuth passes either an Error or an object wrapping one, and the useful
 * part is the name and message. Those are safe to log in production; the
 * surrounding object is not, because for OAuth errors it can include the
 * provider response and therefore tokens.
 */
function describeErrorCause(metadata: unknown): string | null {
    if (!metadata) return null;
    if (metadata instanceof Error) return `${metadata.name}: ${metadata.message}`;
    if (typeof metadata === "object") {
        const error = (metadata as { error?: unknown }).error;
        if (error instanceof Error) return `${error.name}: ${error.message}`;
        if (typeof error === "string") return error;
    }
    return null;
}

/**
 * Builds the app's NextAuth options wired to the Hive OIDC provider:
 * PKCE+state checks, DOT→SimpleJWT token exchange on first sign-in,
 * token-expiry propagation into the session, and a logger that avoids
 * dumping token/PII metadata in production.
 */
export function buildHiveAuthOptions(config: HiveAuthConfig = {}): AuthOptions {
    const hiveUrl = (config.hiveUrl ?? process.env.NEXT_PUBLIC_HIVE_URL ?? "")
        .replace(/\/$/, "");
    const allowedClearances = config.allowedClearances ?? [
        Clearance.Segel,
        Clearance.Admin,
    ];

    const hiveProvider: OAuthConfig<HiveSsoProfile> = {
        id: "hive",
        name: "Hive",
        type: "oauth",
        checks: ["pkce", "state"],

        // Force NextAuth to send credentials in the request body
        client: {
            token_endpoint_auth_method: "client_secret_post",
        },

        wellKnown: `${hiveUrl}/api/core/sso/.well-known/openid-configuration`,
        issuer: `${hiveUrl}/api/core/sso/`,
        authorization: {
            url: `${hiveUrl}/api/core/sso/authorize/`,
            params: { scope: `openid profile clearance extended_profile api` },
        },
        token: `${hiveUrl}/api/core/sso/token/`,
        userinfo: `${hiveUrl}/api/core/sso/userinfo/`,

        clientId: config.clientId ?? process.env.HIVE_CLIENT_ID,
        clientSecret: config.clientSecret ?? process.env.HIVE_CLIENT_SECRET,

        profile(profile) {
            return {
                id: profile.sub.toString(),
                name: `${profile.given_name} ${profile.family_name}`,
                email: profile.email ?? null,
                username: profile.username,
                clearance: profile.clearance,
                program: profile.program,
                gender: profile.gender,
                display_name: profile.display_name,
                is_teacher: profile.is_teacher,
            };
        },
    };

    const signInCallback: CallbacksOptions["signIn"] = async ({ user }) => {
        const hiveUser = user as HiveUser;
        return allowedClearances.includes(hiveUser.clearance);
    };

    const jwtCallback: CallbacksOptions["jwt"] = async ({
        token,
        user,
        account,
    }) => {
        // account is only defined during the very first sign-in step
        if (user && account) {
            const hiveUser = user as HiveUser;

            try {
                // Exchange the opaque DOT token for a SimpleJWT pair
                const exchangeResponse = await fetch(
                    `${hiveUrl}/api/core/sso/exchange/`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${account.access_token}`,
                            "Content-Type": "application/json",
                        },
                    },
                );

                if (!exchangeResponse.ok) {
                    throw new Error(
                        `Token exchange failed with status: ${exchangeResponse.status}`,
                    );
                }

                const jwtData = await exchangeResponse.json();

                const extraData: JwtTokenData = {
                    user: {
                        id: hiveUser.id,
                        name: hiveUser.name,
                        email: hiveUser.email,
                        username: hiveUser.username,
                        clearance: hiveUser.clearance,
                        program: hiveUser.program,
                        gender: hiveUser.gender,
                        display_name: hiveUser.display_name,
                        is_teacher: hiveUser.is_teacher,
                    },
                    // Use the returned SimpleJWT data
                    expires_at: jwtData.expires_at,
                    accessToken: jwtData.access_token,
                    refreshToken: jwtData.refresh_token,
                };
                token.data = extraData;
            } catch (error) {
                console.error("SSO Token Exchange Error:", error);
                // If exchange fails, you must decide whether to reject the token entirely
                // or return a token with empty access flags to force a re-login.
                throw new Error("Authentication failed during token exchange.");
            }
        } else if (token && token.data) {
            const tokenData = token.data as JwtTokenData;
            if (tokenData.expires_at * 1000 < Date.now()) {
                token.error = "TokenExpiredError";
            }
        }

        return token;
    };

    const sessionCallback: CallbacksOptions["session"] = async ({
        session,
        token,
    }) => {
        if (token && token.data) {
            const authSessionData: AuthSessionData = session as AuthSessionData;
            const tokenData = token.data as JwtTokenData;

            if (token.error === "TokenExpiredError") {
                authSessionData.error = "TokenExpiredError";
            }

            authSessionData.user = tokenData.user;
            authSessionData.accessToken = tokenData.accessToken;

            session = authSessionData;
        }
        return session;
    };

    if (!process.env.NEXTAUTH_SECRET) {
        throw new Error(
            "NEXTAUTH_SECRET environment variable is not set — auth will not function.",
        );
    }

    const debugEnabled = config.debug ?? process.env.NODE_ENV !== "production";

    return {
        debug: debugEnabled,
        // Override the logger to intercept metadata
        logger: {
            error(code, metadata) {
                console.error(`\n❌ [NextAuth Error]: ${code}`);
                if (process.env.NODE_ENV !== "production") {
                    console.error(JSON.stringify(metadata, null, 2));
                }
                // The cause, always. Metadata can carry tokens/PII (e.g.
                // OAuthCallbackError includes the provider response), so the
                // full dump stays outside production -- but suppressing
                // everything made production failures undiagnosable, and
                // `next start` runs in production. A CI run failed on
                // SIGNIN_OAUTH_ERROR with nothing in the log but this repo's
                // own Hive URL. An error's name and message do not carry the
                // token payload; the object around them does.
                const cause = describeErrorCause(metadata);
                if (cause) console.error(`Cause: ${cause}`);
                console.error(`Hive URL: ${hiveUrl}`);
            },
            warn(code) {
                console.warn(`\n⚠️ [NextAuth Warning]: ${code}`);
            },
            // Only supplied when debug is actually on. next-auth installs a
            // noop `debug` when the `debug` option is false and then lets a
            // supplied method overwrite it (next-auth/utils/logger.js), so
            // handing it one unconditionally made `debug: false` inert and
            // put CREATE_STATE / PROFILE_DATA / OAUTH_CALLBACK_RESPONSE --
            // i.e. the user profile and the provider token response -- on
            // production stdout. Spreading nothing here leaves the noop in
            // place. The body guards the dump as well, so the code name still
            // logs if a caller forces debug on in production but the payload
            // does not, matching what `error()` above already does.
            ...(debugEnabled
                ? {
                      debug(code: string, metadata: unknown) {
                          console.log(`\n🐛 [NextAuth Debug]: ${code}`);
                          if (process.env.NODE_ENV !== "production") {
                              console.log(JSON.stringify(metadata, null, 2));
                          }
                      },
                  }
                : {}),
        },

        providers: [hiveProvider],
        pages: {
            signIn: config.signInPage ?? "/login",
        },
        callbacks: {
            signIn: signInCallback,
            jwt: jwtCallback,
            session: sessionCallback,
        },
    };
}
