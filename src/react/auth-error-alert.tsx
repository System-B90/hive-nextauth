"use client";

import Alert, { type AlertProps } from "@mui/material/Alert";
import Typography from "@mui/material/Typography";

import {
    DEFAULT_HIVE_AUTH_LOCALE,
    getHiveAuthDirection,
    getHiveAuthErrorMessage,
    type HiveAuthLocale,
} from "../errors.js";

export type AuthErrorAlertProps = {
    /** The `?error=` code (or a client-side `Timeout`/`NetworkError`). Nothing renders when empty. */
    code: null | string | undefined;
    /** Extra detail, e.g. the `?error_description=` / `?message=` query value. */
    description?: null | string;
    locale?: HiveAuthLocale;
    /** Show the raw code under the message, for support tickets. Defaults to true. */
    showCode?: boolean;
} & Omit<AlertProps, "children" | "dir">;

/** Error alert for the login page: localized message, optional detail and the raw code. */
export function AuthErrorAlert({
    code,
    description,
    locale = DEFAULT_HIVE_AUTH_LOCALE,
    showCode = true,
    severity = "error",
    ...props
}: AuthErrorAlertProps) {
    const message = getHiveAuthErrorMessage(code, locale);
    if (!message) return null;
    return (
        <Alert dir={getHiveAuthDirection(locale)} role="alert" severity={severity} {...props}>
            {message}
            {description ? (
                <Typography component="div" variant="body2">
                    {description}
                </Typography>
            ) : null}
            {showCode ? (
                <Typography component="div" dir="ltr" sx={{ opacity: 0.7 }} variant="caption">
                    {code}
                </Typography>
            ) : null}
        </Alert>
    );
}
