import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { signInWithTimeout } from "../../dist/index.js";

describe("signInWithTimeout", () => {
    test("resolves null when signIn settles in time", async () => {
        assert.equal(await signInWithTimeout(async () => undefined, 1000), null);
    });

    test("resolves Timeout when signIn never settles", async () => {
        assert.equal(await signInWithTimeout(() => new Promise(() => {}), 20), "Timeout");
    });

    test("resolves NetworkError when signIn rejects", async () => {
        assert.equal(
            await signInWithTimeout(async () => {
                throw new TypeError("Failed to fetch");
            }, 1000),
            "NetworkError",
        );
    });

    test("resolves NetworkError when signIn throws synchronously", async () => {
        assert.equal(
            await signInWithTimeout(() => {
                throw new Error("boom");
            }, 1000),
            "NetworkError",
        );
    });
});
