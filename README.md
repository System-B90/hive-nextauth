# @system-b90/hive-nextauth

`buildHiveAuthOptions()` — NextAuth Hive OIDC provider factory (PKCE, DOT→SimpleJWT exchange, expiry propagation) — plus `AuthSessionData` types and session→client helpers.

## Install

```powershell
"@system-b90:registry=https://npm.pkg.github.com" | Out-File -Append $HOME\.npmrc
"//npm.pkg.github.com/:_authToken=$env:GITHUB_TOKEN" | Out-File -Append $HOME\.npmrc

npm install @system-b90/hive-nextauth
```

## Usage

```ts
// NextAuth route
import { buildHiveAuthOptions } from "@system-b90/hive-nextauth";
export const authOptions = buildHiveAuthOptions();
```

## Sign-in errors

`getHiveAuthErrorMessage(code, locale?)` maps NextAuth's `?error=` codes, plus the
client-side `Timeout` and `NetworkError`, to user-facing copy. It returns `null` when
there is no error, and a generic message for unknown codes. `locale` is `"he"` (the
default) or `"en"`. `getHiveAuthDirection(locale)` gives the matching `dir`.

```tsx
import { getHiveAuthDirection, getHiveAuthErrorMessage } from "@system-b90/hive-nextauth";

const error = useSearchParams().get("error");
const message = getHiveAuthErrorMessage(error, "en");
return message ? <Alert dir={getHiveAuthDirection("en")} severity="error">{message}</Alert> : null;
```

Report a `signIn()` that rejects as `NetworkError`, and one with no answer after about
15 s as `Timeout`.

### App and Hive on one Docker host

NextAuth exchanges the OAuth code with Hive **server-side**, from inside the app's
container. When Hive runs on the same host, its hostname usually resolves (through the
host's hosts file) to a loopback address. Inside the app container, that loopback is the
container itself, so sign-in fails with `OAuthCallback` or `OAuthSignin`.

To fix it, join the app to Hive's Docker network and give Hive's nginx an alias for its
public hostname:

```bash
docker network connect --alias <hive hostname> <hive network> <hive nginx container>
```

Then use the app's `docker-compose.hive-local.yml` overlay, which attaches the app to the
external `hive_net` network. Bluz and peek-a-boo both ship one.

## Publishing

CI publishes on GitHub Release (or manual dispatch) via `.github/workflows/publish.yml`. Bump `version` in `package.json` before releasing. Requires `@system-b90/hive-core` to be published first if bumped together.
