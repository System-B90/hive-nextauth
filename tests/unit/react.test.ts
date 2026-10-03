import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getHiveAuthErrorMessage } from "../../dist/index.js";
import { AuthErrorAlert, LoginWithHive } from "../../dist/react/index.js";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
    renderToStaticMarkup(element);

describe("AuthErrorAlert", () => {
    test("renders nothing without a code", () => {
        assert.equal(render(createElement(AuthErrorAlert, { code: null })), "");
    });

    test("renders the Hebrew message, rtl, with detail and raw code by default", () => {
        const html = render(
            createElement(AuthErrorAlert, { code: "OAuthCallback", description: "hive down" }),
        );
        assert.ok(html.includes(getHiveAuthErrorMessage("OAuthCallback", "he")!));
        assert.match(html, /dir="rtl"/);
        assert.ok(html.includes("hive down"));
        assert.ok(html.includes(">OAuthCallback<"));
    });

    test("renders English ltr and can hide the code", () => {
        const html = render(
            createElement(AuthErrorAlert, { code: "Timeout", locale: "en", showCode: false }),
        );
        assert.ok(html.includes(getHiveAuthErrorMessage("Timeout", "en")!));
        assert.match(html, /dir="ltr"/);
        assert.ok(!html.includes(">Timeout<"));
    });
});

describe("LoginWithHive", () => {
    test("defaults to the Hebrew label in an rtl button", () => {
        const html = render(createElement(LoginWithHive));
        assert.ok(html.includes("התחברות עם הייב"));
        assert.match(html, /<button[^>]*dir="rtl"/);
    });

    test("uses the English label in an ltr button", () => {
        const html = render(createElement(LoginWithHive, { locale: "en" }));
        assert.ok(html.includes("Sign in with Hive"));
        assert.match(html, /<button[^>]*dir="ltr"/);
    });
});
