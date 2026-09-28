import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { getHiveAuthErrorMessage } from "../../dist/index.js";

describe("getHiveAuthErrorMessage", () => {
    test("returns null when there is no error", () => {
        assert.equal(getHiveAuthErrorMessage(null), null);
        assert.equal(getHiveAuthErrorMessage(undefined), null);
        assert.equal(getHiveAuthErrorMessage(""), null);
    });

    test("gives distinct copy for known codes", () => {
        const access = getHiveAuthErrorMessage("AccessDenied");
        const callback = getHiveAuthErrorMessage("Callback");
        assert.ok(access && callback && access !== callback);
    });

    test("falls back to a generic message for unknown codes", () => {
        assert.ok(getHiveAuthErrorMessage("SomethingNew"));
        assert.equal(
            getHiveAuthErrorMessage("SomethingNew"),
            getHiveAuthErrorMessage("AlsoNew"),
        );
    });
});

describe("getHiveAuthErrorMessage locales (#13)", () => {
    const CODES = [
        "AccessDenied", "AuthenticationFailed", "Callback", "Configuration",
        "NetworkError", "OAuthAccountNotLinked", "OAuthCallback", "OAuthSignin",
        "SessionRequired", "Timeout", "Verification",
    ];

    test("defaults to Hebrew, so existing callers are unchanged", () => {
        for (const code of CODES) {
            assert.equal(getHiveAuthErrorMessage(code), getHiveAuthErrorMessage(code, "he"));
            assert.match(getHiveAuthErrorMessage(code) ?? "", /[֐-׿]/);
        }
    });

    test("has an English string for every code, including client-side ones", () => {
        const english = CODES.map((code) => getHiveAuthErrorMessage(code, "en") ?? "");
        for (const message of english) {
            assert.ok(message.length > 0);
            assert.doesNotMatch(message, /[֐-׿]/);
        }
        assert.equal(new Set(english).size, CODES.length);
        assert.match(getHiveAuthErrorMessage("SomethingNew", "en") ?? "", /^[A-Z]/);
        assert.equal(getHiveAuthErrorMessage(null, "en"), null);
    });

    test("gives the direction for each locale", async () => {
        const { getHiveAuthDirection } = await import("../../dist/index.js");
        assert.equal(getHiveAuthDirection(), "rtl");
        assert.equal(getHiveAuthDirection("he"), "rtl");
        assert.equal(getHiveAuthDirection("en"), "ltr");
    });
});

describe("getHiveClearanceDeniedMessage", () => {
    test("tells a Hanich to go to the hadas and a Checker to find staff", async () => {
        const { getHiveClearanceDeniedMessage } = await import("../../dist/index.js");
        assert.equal(getHiveClearanceDeniedMessage("1", "Male"), 'גש לחד"ס');
        assert.equal(getHiveClearanceDeniedMessage("1", "Female"), 'גשי לחד"ס');
        assert.equal(getHiveClearanceDeniedMessage("1"), 'גש/י לחד"ס');
        assert.equal(getHiveClearanceDeniedMessage(2, "Male"), "תפנה לאיש הסגל הקרוב לביתך");
        assert.equal(getHiveClearanceDeniedMessage(2, "Female"), "תפני לאיש הסגל הקרוב לביתך");
        assert.equal(getHiveClearanceDeniedMessage(null), null);
        assert.equal(getHiveClearanceDeniedMessage("0"), null);
    });
});
