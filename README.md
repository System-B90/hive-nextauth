# @system-b15/hive-nextauth

`buildHiveAuthOptions()` — NextAuth Hive OIDC provider factory (PKCE, DOT→SimpleJWT exchange, expiry propagation) — plus `AuthSessionData` types and session→client helpers.

## Install

```powershell
"@system-b15:registry=https://npm.pkg.github.com" | Out-File -Append $HOME\.npmrc
"//npm.pkg.github.com/:_authToken=$env:GITHUB_TOKEN" | Out-File -Append $HOME\.npmrc

npm install @system-b15/hive-nextauth
```

## Usage

```ts
// NextAuth route
import { buildHiveAuthOptions } from "@system-b15/hive-nextauth";
export const authOptions = buildHiveAuthOptions();
```

## Publishing

CI publishes on GitHub Release (or manual dispatch) via `.github/workflows/publish.yml`. Bump `version` in `package.json` before releasing. Requires `@system-b15/hive-core` to be published first if bumped together.
