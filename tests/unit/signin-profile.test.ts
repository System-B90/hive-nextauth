import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

// Imports the built package, the same entry point consumers resolve.
import { Clearance, GenderEnum } from "@system-b90/hive-core";
import { buildHiveAuthOptions } from "../../dist/index.js";

const HIVE_URL = "https://hive.test";
const DENIED = "/access-denied?reason=clearance";
const deniedFor = (clearance: number) => `${DENIED}&clearance=${clearance}`;

beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function signIn(user: unknown, config: Record<string, unknown> = {}): Promise<any> {
    const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL, ...config });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (options.callbacks!.signIn as any)({ user });
}

/** Pulls the Hive provider's `profile` mapper out of the built options. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function profileMapper(): (profile: any) => any {
    const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = options.providers[0] as any;
    return provider.profile;
}

describe("signIn clearance gate", () => {
    test("admits Segel and Admin by default", async () => {
        assert.equal(await signIn({ clearance: Clearance.Segel }), true);
        assert.equal(await signIn({ clearance: Clearance.Admin }), true);
    });

    test("rejects every clearance below Segel", async () => {
        assert.equal(await signIn({ clearance: Clearance.Hanich }), deniedFor(Clearance.Hanich));
        assert.equal(await signIn({ clearance: Clearance.Checker }), deniedFor(Clearance.Checker));
        assert.equal(await signIn({ clearance: Clearance.Logged_Out }), deniedFor(Clearance.Logged_Out));
    });

    test("rejects a user with no clearance rather than coercing to allow", async () => {
        // Logged_Out is 0, so any truthiness-based rewrite of this check would
        // both admit undefined and reject a legitimately logged-out zero.
        assert.equal(await signIn({}), DENIED);
        assert.equal(await signIn({ clearance: undefined }), DENIED);
        assert.equal(await signIn({ clearance: null }), DENIED);
    });

    test("rejects a clearance that is not in the enum at all", async () => {
        assert.equal(await signIn({ clearance: 99 }), deniedFor(99));
        assert.equal(await signIn({ clearance: "Admin" }), DENIED);
    });

    test("honours a custom allowedClearances list", async () => {
        const onlyAdmin = { allowedClearances: [Clearance.Admin] };
        assert.equal(await signIn({ clearance: Clearance.Admin }, onlyAdmin), true);
        assert.equal(await signIn({ clearance: Clearance.Segel }, onlyAdmin), deniedFor(Clearance.Segel));

        const withHanich = {
            allowedClearances: [Clearance.Hanich, Clearance.Segel, Clearance.Admin],
        };
        assert.equal(await signIn({ clearance: Clearance.Hanich }, withHanich), true);
    });

    test("an empty allowedClearances list locks everyone out", async () => {
        const noOne = { allowedClearances: [] };
        assert.equal(await signIn({ clearance: Clearance.Admin }, noOne), deniedFor(Clearance.Admin));
        assert.equal(await signIn({ clearance: Clearance.Segel }, noOne), deniedFor(Clearance.Segel));
    });
});

const HIVE_PROFILE = {
    sub: 42,
    given_name: "Dana",
    family_name: "Cohen",
    email: "dana@hive.test",
    username: "dana",
    clearance: Clearance.Segel,
    program: 7,
    gender: GenderEnum.Female,
    display_name: "Dana C.",
    is_teacher: true,
};

describe("signIn rejection target", () => {
    test("honours a custom accessDeniedPage", async () => {
        assert.equal(
            await signIn({ clearance: Clearance.Hanich }, { accessDeniedPage: "/nope" }),
            "/nope?reason=clearance&clearance=" + Clearance.Hanich,
        );
    });

    test("passes the gender so the page can conjugate its copy", async () => {
        assert.equal(
            await signIn({ clearance: Clearance.Checker, gender: GenderEnum.Female }),
            `${deniedFor(Clearance.Checker)}&gender=Female`,
        );
    });

    test("routes other auth errors to the sign-in page, not NextAuth's default", () => {
        const options = buildHiveAuthOptions({ hiveUrl: HIVE_URL });
        assert.equal(options.pages?.error, "/login");
        const custom = buildHiveAuthOptions({ hiveUrl: HIVE_URL, errorPage: "/oops" });
        assert.equal(custom.pages?.error, "/oops");
    });
});

describe("OIDC profile mapping", () => {
    test("maps every field a consumer's AuthSessionUser needs", () => {
        assert.deepEqual(profileMapper()(HIVE_PROFILE), {
            id: "42",
            name: "Dana Cohen",
            email: "dana@hive.test",
            username: "dana",
            clearance: Clearance.Segel,
            program: 7,
            gender: GenderEnum.Female,
            display_name: "Dana C.",
            is_teacher: true,
        });
    });

    test("stringifies a numeric sub", () => {
        // Hive sends `sub` as a number; NextAuth requires `id` to be a string.
        const mapped = profileMapper()({ ...HIVE_PROFILE, sub: 1234 });
        assert.equal(mapped.id, "1234");
        assert.equal(typeof mapped.id, "string");
    });

    test("passes a string sub through unchanged", () => {
        assert.equal(profileMapper()({ ...HIVE_PROFILE, sub: "42" }).id, "42");
    });

    test("falls back to null for a missing email", () => {
        // `email ?? null`, not `|| null`: the distinction matters because
        // AuthSessionUser types email as `null | string`, never undefined.
        const withoutEmail = { ...HIVE_PROFILE, email: undefined };
        assert.equal(profileMapper()(withoutEmail).email, null);

        const absent = { ...HIVE_PROFILE };
        delete (absent as { email?: string }).email;
        assert.equal(profileMapper()(absent).email, null);
    });

    test("keeps an empty-string email rather than nulling it", () => {
        // `??` only catches null/undefined. Pinned so a swap to `||` is visible.
        assert.equal(profileMapper()({ ...HIVE_PROFILE, email: "" }).email, "");
    });

    test("joins the given and family names with a single space", () => {
        assert.equal(
            profileMapper()({
                ...HIVE_PROFILE,
                given_name: "Yoav",
                family_name: "Ben Ari",
            }).name,
            "Yoav Ben Ari",
        );
    });

    test("passes null program and non-teacher through", () => {
        const mapped = profileMapper()({
            ...HIVE_PROFILE,
            program: null,
            is_teacher: false,
        });
        assert.equal(mapped.program, null);
        assert.equal(mapped.is_teacher, false);
    });

    test("does not leak unmapped profile claims into the user", () => {
        // The mapper is an explicit field list; OIDC claims like at_hash and
        // the api_token payload must not ride along into the session.
        const mapped = profileMapper()({
            ...HIVE_PROFILE,
            at_hash: "abc",
            jti: "xyz",
            api_token: { access_token: "leak", refresh_token: "leak" },
        });

        assert.deepEqual(Object.keys(mapped).sort(), [
            "clearance",
            "display_name",
            "email",
            "gender",
            "id",
            "is_teacher",
            "name",
            "program",
            "username",
        ]);
    });
});
