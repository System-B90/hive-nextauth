"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { signIn } from "next-auth/react";
import { type ReactNode, useCallback, useState } from "react";

import {
    DEFAULT_HIVE_AUTH_LOCALE,
    getHiveAuthDirection,
    type HiveAuthErrorCode,
    type HiveAuthLocale,
} from "../errors.js";
import { DEFAULT_SIGN_IN_TIMEOUT_MS, signInWithTimeout } from "../sign-in.js";
import { AuthErrorAlert } from "./auth-error-alert.js";

const LABELS: Record<HiveAuthLocale, { idle: string; busy: string }> = {
    en: { idle: "Sign in with Hive", busy: "Signing in..." },
    he: { idle: "התחברות עם הייב", busy: "מתחברים..." },
};

export type LoginWithHiveProps = {
    callbackUrl?: string;
    locale?: HiveAuthLocale;
    /** Icon shown while idle (e.g. the app's Hive logo). Replaced by a spinner while signing in. */
    icon?: ReactNode;
    /** Overrides the localized button text. */
    label?: ReactNode;
    timeoutMs?: number;
    /**
     * Called with `Timeout`/`NetworkError` when the sign-in fails client-side.
     * When omitted the button renders an `AuthErrorAlert` under itself.
     */
    onError?: (code: Extract<HiveAuthErrorCode, "NetworkError" | "Timeout">) => void;
} & Omit<ButtonProps, "dir" | "onClick" | "startIcon">;

/**
 * "Sign in with Hive" button: spinner while redirecting, and a localized
 * error instead of silence when Hive never answers or `signIn()` rejects.
 */
export function LoginWithHive({
    callbackUrl = "/",
    locale = DEFAULT_HIVE_AUTH_LOCALE,
    icon,
    label,
    timeoutMs = DEFAULT_SIGN_IN_TIMEOUT_MS,
    onError,
    disabled,
    fullWidth = true,
    size = "large",
    variant = "contained",
    sx,
    ...props
}: LoginWithHiveProps) {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [errorCode, setErrorCode] = useState<HiveAuthErrorCode | null>(null);

    const handleClick = useCallback(() => {
        setIsSigningIn(true);
        setErrorCode(null);
        void signInWithTimeout(async () => await signIn("hive", { callbackUrl }), timeoutMs).then(
            (code) => {
                // Success means the browser is navigating away; keep the spinner.
                if (!code) return;
                setIsSigningIn(false);
                if (onError) onError(code);
                else setErrorCode(code);
            },
        );
    }, [callbackUrl, onError, timeoutMs]);

    const text = LABELS[locale] ?? LABELS[DEFAULT_HIVE_AUTH_LOCALE];
    return (
        <>
            <Button
                dir={getHiveAuthDirection(locale)}
                disabled={disabled || isSigningIn}
                fullWidth={fullWidth}
                onClick={handleClick}
                size={size}
                startIcon={isSigningIn ? <CircularProgress color="inherit" size={20} /> : icon}
                // MUI's startIcon margins are physical (left/right) and do not
                // flip under dir="rtl"; use logical ones instead.
                sx={[
                    {
                        "& .MuiButton-startIcon": {
                            marginLeft: 0,
                            marginRight: 0,
                            marginInlineStart: "-4px",
                            marginInlineEnd: "8px",
                        },
                    },
                    ...(sx === undefined ? [] : Array.isArray(sx) ? sx : [sx]),
                ]}
                variant={variant}
                {...props}
            >
                {label ?? (isSigningIn ? text.busy : text.idle)}
            </Button>
            {errorCode ? <AuthErrorAlert code={errorCode} locale={locale} sx={{ mt: 2 }} /> : null}
        </>
    );
}
