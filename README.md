# agentauth

> OAuth in 3 lines for AI agents. Device flow + localhost callback, multi-provider, file-backed token storage with auto-refresh. Built for the contexts where browser-redirect OAuth doesn't fit: CLIs, MCP servers, desktop agents, anything running locally on a user's machine.

```ts
import { AgentAuth } from "@s300169140/agentauth"
import { github } from "@s300169140/agentauth/providers/github"

const auth = new AgentAuth({ providers: [github({ clientId: "Iv1.abcd1234" })] })
const { token } = await auth.authorize("github", { scopes: ["repo"] })
// → use token.accessToken in your API calls
```

That's the entire user-facing surface. No server. No redirect URLs. No Express middleware. Cached tokens are reused on subsequent calls; expired ones refresh in the background.

## Why this exists

Every OAuth library on npm assumes the same shape: your app is a web server, the user's browser does a redirect, you handle a callback at `/auth/callback`. That works great for SaaS — and is wrong for AI agents, which usually run as:

- A **CLI** the user just `npx`'d
- An **MCP server** spawned by Claude Desktop / Cline / Cursor
- A **desktop app** with no public URL
- A **background process** in CI that needs to refresh a token

These contexts need different OAuth flows: **device flow** (where the user sees a code and types it on any browser) or **loopback flow** (where a localhost server briefly opens to catch the callback). agentauth does both, with a multi-provider plugin shape so you can BYO any service.

## Install

```sh
npm install @s300169140/agentauth
# or
bun add @s300169140/agentauth
```

Node 18+ required (uses native `fetch`).

## Built-in providers

| Provider | Default flow | OAuth setup |
|---|---|---|
| `github` | Device | https://github.com/settings/developers → New OAuth App → ✅ Enable Device Flow |
| `slack` | Loopback | https://api.slack.com/apps → New App → OAuth & Permissions → Redirect URLs: `http://127.0.0.1:8765/callback` |
| `notion` | Loopback | https://www.notion.so/my-integrations → New integration → Redirect URIs: `http://127.0.0.1:8766/callback` |

More providers landing soon: Linear, Google, Atlassian, Discord. **Want one prioritized? [Open an issue](https://github.com/s300169140/agentauth/issues/new) with the service name.**

You can also write your own — see [Custom providers](#custom-providers).

```ts
import { AgentAuth } from "@s300169140/agentauth"
import { github } from "@s300169140/agentauth/providers/github"
import { slack } from "@s300169140/agentauth/providers/slack"
import { notion } from "@s300169140/agentauth/providers/notion"

const auth = new AgentAuth({
  providers: [
    github({ clientId: process.env.GH_CLIENT_ID! }),
    slack({ clientId: process.env.SLACK_CLIENT_ID!, clientSecret: process.env.SLACK_CLIENT_SECRET! }),
    notion({ clientId: process.env.NOTION_CLIENT_ID!, clientSecret: process.env.NOTION_CLIENT_SECRET! }),
  ],
})

const gh = await auth.authorize("github", { scopes: ["repo"] })
const sl = await auth.authorize("slack", { scopes: ["channels:read", "chat:write"] })
const nt = await auth.authorize("notion")
```

## Common patterns

### Token reuse (the default)

`authorize()` returns a cached token if a valid one exists. Repeated calls in the same process — or across process restarts — don't re-prompt the user.

```ts
const auth = new AgentAuth({ providers: [github({ clientId })] })
const { token, isNew } = await auth.authorize("github", { scopes: ["repo"] })
// First run:  isNew === true   (browser opens, user consents)
// Later runs: isNew === false  (returned from ~/.agentauth/tokens.json)
```

### Force a fresh consent

```ts
await auth.authorize("github", { scopes: ["repo"], force: true })
```

### Multiple accounts (work + personal)

```ts
const work = await auth.authorize("github", { account: "work" })
const personal = await auth.authorize("github", { account: "personal" })
// Two distinct tokens cached side by side.
```

### Logout

```ts
await auth.logout("github")          // forget the default account
await auth.logout("github", "work")  // forget a specific account
```

### Custom token storage

Default is `FileTokenStorage` at `~/.agentauth/tokens.json` (mode 0600). Want OS keychain, Vault, an in-memory map, your own SQLite — implement `TokenStorage`:

```ts
import type { TokenStorage } from "@s300169140/agentauth"

const myStorage: TokenStorage = {
  async get(key) { /* ... */ },
  async set(key, token) { /* ... */ },
  async delete(key) { /* ... */ },
}

const auth = new AgentAuth({ storage: myStorage, providers: [...] })
```

Or use the in-memory store for tests:

```ts
import { MemoryTokenStorage } from "@s300169140/agentauth"
const auth = new AgentAuth({ storage: new MemoryTokenStorage(), providers: [...] })
```

### Silence the "open this URL..." prompts

```ts
const auth = new AgentAuth({ log: false, providers: [...] })
// or pipe to your own logger:
const auth = new AgentAuth({ log: (msg) => myLogger.info(msg), providers: [...] })
```

## Custom providers

A provider is a tiny object with one or both of `authorizeDevice` / `authorizeLoopback`. Here's the shape — full TypeScript types in [`src/types.ts`](./src/types.ts):

```ts
import type { Provider, ProviderFlowContext, Token } from "@s300169140/agentauth"

export const myService: Provider = {
  id: "myservice",
  name: "My Service",
  defaultFlow: "device",

  async authorizeDevice(ctx: ProviderFlowContext): Promise<Token> {
    // 1. POST to your /device/code endpoint
    // 2. ctx.log("Open ${url}, enter ${code}") + ctx.openBrowser(url)
    // 3. Poll your /token endpoint until consent or timeout
    // 4. return a Token
  },

  // optional — for refresh-token-supporting providers
  async refresh(token: Token): Promise<Token> {
    // POST to your /token endpoint with refresh_token grant
  },
}
```

[`src/providers/github.ts`](./src/providers/github.ts) is a fully-worked reference (~200 lines).

## What it does NOT try to be

- ❌ A full IAM platform. Use Okta / Auth0 / Clerk for that.
- ❌ A server-side OAuth library. Use [`@octokit/auth-oauth-app`](https://github.com/octokit/auth-app.js) or [`openid-client`](https://github.com/panva/openid-client) for that.
- ❌ A token vault for sharing across multiple users. This is single-user-on-their-own-machine.
- ❌ An OS-keychain wrapper. `keytar` requires native bindings that break `npx`-style usage on Bun / minimal containers / CI. Files at mode 0600 are good enough for the default; bring your own keychain backend if you want one.

## License

[MIT](./LICENSE).

## Contributing

Bug reports + provider PRs welcome. The bar:

1. New providers must include a small test file that exercises the happy path with mocked `fetch`. See [`tests/core.test.ts`](./tests/core.test.ts) for patterns.
2. `bun test` and `bun run typecheck` pass.
3. The provider's OAuth setup (where to register the app, which scopes mean what) is documented in the file header.

If your service has weird OAuth (PKCE-only, custom grant types, non-standard error codes), the `Provider` interface accommodates it — the library doesn't try to enforce a single shape.
