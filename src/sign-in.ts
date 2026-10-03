/*
 * Framework-free core of the "Login with Hive" button: start the sign-in and
 * turn a hang or a rejection into one of the client-side error codes, so the
 * same copy (`getHiveAuthErrorMessage`) covers them.
 */

import type { HiveAuthErrorCode } from "./errors.js";

/** How long `signIn()` may take to redirect before the attempt counts as a `Timeout`. */
export const DEFAULT_SIGN_IN_TIMEOUT_MS = 15000;

/**
 * Runs `start` (normally `() => signIn("hive", { callbackUrl })`) and
 * resolves to null when it settles in time, `"Timeout"` when it does not
 * within `timeoutMs`, or `"NetworkError"` when it rejects. Never rejects.
 */
export async function signInWithTimeout(
    start: () => Promise<unknown>,
    timeoutMs: number = DEFAULT_SIGN_IN_TIMEOUT_MS,
): Promise<Extract<HiveAuthErrorCode, "NetworkError" | "Timeout"> | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"Timeout">((resolve) => {
        timer = setTimeout(() => resolve("Timeout"), timeoutMs);
    });
    try {
        return await Promise.race([
            Promise.resolve()
                .then(start)
                .then(() => null),
            timeout,
        ]);
    } catch {
        return "NetworkError";
    } finally {
        clearTimeout(timer);
    }
}
