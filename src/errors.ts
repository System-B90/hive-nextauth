/*
 * User-facing copy for every way a Hive sign-in can fail. Each consuming app
 * used to keep its own (drifting) switch over NextAuth's `?error=` codes;
 * this is the one list they can share.
 */

/** Default route the clearance gate redirects rejected users to. */
export const DEFAULT_ACCESS_DENIED_PAGE = "/access-denied";

/**
 * Why a user landed on the access-denied page, passed as `?reason=`.
 * - `clearance`: signed in to Hive fine, but their clearance is not allowed.
 * - `forbidden`: signed in to this app, but not allowed on this particular page.
 */
export type HiveAccessDeniedReason = "clearance" | "forbidden";

/**
 * NextAuth's own `?error=` codes plus the ones System-B90 apps add
 * (`AuthenticationFailed` from the route-handler wrapper, `Timeout` /
 * `NetworkError` from client-side `signIn()` failures).
 */
export type HiveAuthErrorCode =
    | "AccessDenied"
    | "AuthenticationFailed"
    | "Callback"
    | "Configuration"
    | "NetworkError"
    | "OAuthAccountNotLinked"
    | "OAuthCallback"
    | "OAuthSignin"
    | "SessionRequired"
    | "Timeout"
    | "Verification";

/** Languages the sign-in copy ships in. Hebrew is the default everywhere. */
export type HiveAuthLocale = "en" | "he";

export const DEFAULT_HIVE_AUTH_LOCALE: HiveAuthLocale = "he";

/** Text direction for a locale, for `dir=` on alerts/buttons showing this copy. */
export function getHiveAuthDirection(
    locale: HiveAuthLocale = DEFAULT_HIVE_AUTH_LOCALE,
): "ltr" | "rtl" {
    return locale === "he" ? "rtl" : "ltr";
}

const HIVE_AUTH_ERROR_MESSAGES_HE: Record<HiveAuthErrorCode, string> = {
    AccessDenied: "למשתמש שלך אין הרשאה מתאימה לגישה למערכת.",
    AuthenticationFailed:
        "שירות ההתחברות אינו זמין כרגע. נסו שוב בעוד מספר דקות.",
    // NextAuth reports a throw inside our callbacks (in practice: the
    // DOT→SimpleJWT exchange with Hive failing) as `Callback`.
    Callback:
        "ההזדהות מול הייב הצליחה, אך לא ניתן היה להשלים את ההתחברות למערכת. נסו שוב, ואם התקלה חוזרת פנו לצוות התמיכה.",
    Configuration: "תקלת הגדרות בצד השרת. יש לפנות לצוות התמיכה.",
    NetworkError: "לא ניתן להגיע לשרת הייב. בדקו את החיבור לרשת ונסו שוב.",
    OAuthAccountNotLinked:
        "כתובת המייל משויכת לחשבון קיים. יש להתחבר באמצעות שיטת ההתחברות המקורית.",
    OAuthCallback:
        "לא ניתן היה להשלים את תהליך ההזדהות מול הייב. ייתכן ששרת הייב אינו זמין כרגע.",
    OAuthSignin:
        "לא ניתן היה להתחיל את תהליך ההזדהות מול הייב. ייתכן ששרת הייב אינו זמין כרגע.",
    SessionRequired: "נדרשת התחברות מחדש כדי להמשיך.",
    Timeout: "שרת הייב לא הגיב בזמן. בדקו את החיבור לרשת ונסו שוב.",
    Verification: "קישור ההתחברות פג תוקף או שכבר נעשה בו שימוש.",
};

const HIVE_AUTH_ERROR_MESSAGES_EN: Record<HiveAuthErrorCode, string> = {
    AccessDenied: "Your account does not have permission to access this system.",
    AuthenticationFailed:
        "The sign-in service is unavailable right now. Try again in a few minutes.",
    Callback:
        "Hive verified you, but signing in to this system could not be completed. Try again, and contact support if it keeps happening.",
    Configuration: "Server configuration error. Contact support.",
    NetworkError: "Hive cannot be reached. Check your network connection and try again.",
    OAuthAccountNotLinked:
        "This email is linked to an existing account. Sign in with the method you used originally.",
    OAuthCallback:
        "Signing in with Hive could not be completed. Hive may be unavailable right now.",
    OAuthSignin:
        "Signing in with Hive could not be started. Hive may be unavailable right now.",
    SessionRequired: "Please sign in again to continue.",
    Timeout: "Hive did not respond in time. Check your network connection and try again.",
    Verification: "The sign-in link has expired or was already used.",
};

const HIVE_AUTH_ERROR_MESSAGES: Record<
    HiveAuthLocale,
    Record<HiveAuthErrorCode, string>
> = {
    en: HIVE_AUTH_ERROR_MESSAGES_EN,
    he: HIVE_AUTH_ERROR_MESSAGES_HE,
};

const UNKNOWN_ERROR_MESSAGES: Record<HiveAuthLocale, string> = {
    en: "Something went wrong while signing in. You can try again.",
    he: "אירעה שגיאה במהלך תהליך ההתחברות. ניתן לנסות שוב.",
};

/**
 * Maps a NextAuth `?error=` code to a message in `locale` (Hebrew by default). Returns null when
 * there is no error; unknown codes get a generic message rather than null so
 * a failure is never silently swallowed.
 */
export function getHiveAuthErrorMessage(
    code: null | string | undefined,
    locale: HiveAuthLocale = DEFAULT_HIVE_AUTH_LOCALE,
): null | string {
    if (!code) return null;
    const messages = HIVE_AUTH_ERROR_MESSAGES[locale] ?? HIVE_AUTH_ERROR_MESSAGES_HE;
    return (
        messages[code as HiveAuthErrorCode] ??
        UNKNOWN_ERROR_MESSAGES[locale] ??
        UNKNOWN_ERROR_MESSAGES.he
    );
}

/**
 * Copy for the access-denied page when the clearance gate rejected a user,
 * keyed by the `?clearance=` it passes and conjugated by `?gender=`
 * (a GenderEnum value). Returns null for clearances with no specific
 * instruction, so the page can fall back to its generic text.
 */
export function getHiveClearanceDeniedMessage(
    clearance: null | number | string | undefined,
    gender?: null | string,
): null | string {
    const pick = (male: string, female: string, neutral: string) =>
        gender === "Male" ? male : gender === "Female" ? female : neutral;
    switch (Number(clearance)) {
    case 1: // Clearance.Hanich
        return `${pick("גש", "גשי", "גש/י")} לחד"ס`;
    case 2: // Clearance.Checker
        return `${pick("תפנה", "תפני", "תפנה/י")} לאיש הסגל הקרוב לביתך`;
    default:
        return null;
    }
}
