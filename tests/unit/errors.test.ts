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
