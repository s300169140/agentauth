# Launch playbook

Drafts ready to fire when `npm publish` succeeds. Don't post all four on the same day — space them by 24-48h so each gets its own attention budget.

---

## Channel 1: Hacker News (Show HN)

Best window: **weekday, 7-9am Pacific**. Post on a Tuesday/Wednesday for highest sustained traffic. Avoid Mondays (HN noise) and Fridays (low retention).

**Title** (must start with "Show HN:"; max 80 chars):

> Show HN: Agentauth – OAuth in 3 lines for AI agents (CLI, MCP, desktop)

**Body** (HN strips markdown — write in plain prose with blank-line paragraphs):

> Hey HN — I built agentauth, a small TypeScript library for adding OAuth to AI agents.
>
> Every existing OAuth library on npm assumes the same shape: your app is a web server, the user's browser does a redirect, you handle a callback at /auth/callback. That works for SaaS — and it's wrong for AI agents, which usually run as a CLI the user just npx'd, an MCP server spawned by Claude Desktop / Cline / Cursor, or a background process in CI.
>
> These contexts need different OAuth flows: device flow (where the user sees a code and types it on any browser) or loopback flow (where a localhost server briefly opens to catch the callback). Agentauth does both, with a small plugin shape so you can BYO providers.
>
> Usage:
>
>   const auth = new AgentAuth({ providers: [github({ clientId })] })
>   const { token } = await auth.authorize("github", { scopes: ["repo"] })
>
> That's it. Browser opens, user clicks Authorize, token cached at ~/.agentauth/tokens.json (mode 0600), auto-refreshes when expired. No server. No redirect URL. No Express middleware.
>
> Built-in providers right now: GitHub (device flow), Slack and Notion (loopback). Custom providers are ~30 lines — see the README.
>
> What it explicitly is NOT: a full IAM platform (use Okta/Auth0 for that), a server-side OAuth library (use openid-client), a token vault for sharing across teams (single-user-on-their-own-machine).
>
> Repo: https://github.com/s300169140/agentauth
> npm: https://www.npmjs.com/package/agentauth
>
> Feedback welcome — particularly on which provider to add next.

**After posting:**

1. Don't reply to your own thread for the first hour — let people upvote based on the title alone
2. Reply to every substantive comment within 30 minutes
3. If someone says "what about library X?" — name what's different about agentauth, don't dismiss the alternative
4. Stick around for 4-6 hours after posting; engagement is what keeps you on the front page

---

## Channel 2: dev.to (article post)

Post 1-2 days after HN. Different audience (more day-job devs, less startup crowd). dev.to actually drives sustained organic traffic via SEO.

**Title:**

> I built an OAuth library specifically for AI agents — here's why "just use Auth0" doesn't work

**Tags:** `#javascript`, `#typescript`, `#opensource`, `#ai`, `#oauth`

**Body:**

````markdown
Last week I needed to add GitHub auth to an MCP server. I figured I'd grab whatever the standard npm package is, drop it in, ship.

I was wrong.

Every OAuth library on npm — `@octokit/auth-oauth-app`, `next-auth`, `clerk`, `auth0`, `openid-client` — assumes you have a web server with a public URL like `myapp.com/auth/callback`. The flow goes: user clicks "Connect GitHub", browser redirects to GitHub, GitHub redirects back to your callback URL, you exchange the code for a token.

Now imagine your "app" is an MCP server spawned by Claude Desktop. Or a CLI the user just `npx`'d. Or a desktop app with no server. **You don't have a public URL.** You can't have one. The whole library shape is wrong for you.

So I wrote [`agentauth`](https://github.com/s300169140/agentauth). It does OAuth specifically for the contexts AI agents actually live in: CLIs, MCP servers, desktop apps, anything running locally on the user's machine.

```ts
import { AgentAuth } from "agentauth"
import { github } from "agentauth/providers/github"

const auth = new AgentAuth({
  providers: [github({ clientId: process.env.GH_CLIENT_ID! })],
})
const { token } = await auth.authorize("github", { scopes: ["repo"] })
// ✓ Browser opens
// ✓ User consents
// ✓ Token cached at ~/.agentauth/tokens.json (mode 0600)
// ✓ Subsequent calls return cached token, refresh when expired
```

Three lines. That's the whole API.

## How it works under the hood

Two OAuth flows, picked based on what the provider supports:

**Device flow (RFC 8628)** — for providers like GitHub. Library gets a device + user code from the provider, prints `Open https://github.com/login/device, enter ABCD-EFGH`, polls until the user consents on any browser. Works in containers, SSH, Bun, no localhost needed.

**Loopback flow (RFC 8252)** — for providers without device flow (Slack, Notion). Library briefly listens on `127.0.0.1:RANDOM_PORT/callback`, opens browser to provider, captures the callback. Server shuts down immediately after the code arrives.

Token persistence is a JSON file at `~/.agentauth/tokens.json` with mode 0600 (POSIX) — atomic writes via rename. I deliberately did NOT depend on `keytar` / native OS keychain — those require a node-gyp build that breaks `npx`-style usage on Bun, minimal containers, CI. Users who want OS keychain backing can implement `TokenStorage` themselves in 30 lines.

## What it doesn't do

I want to be specific about scope:

- **Not a full IAM platform.** Okta, Auth0, Clerk own that space. Different problem.
- **Not server-side OAuth.** `openid-client` does that better than I ever will.
- **Not a token vault.** Single-user-on-their-own-machine. Sharing tokens across teammates is a different product (a hosted SaaS — coming if there's demand).
- **Not opinionated about your AI framework.** Returns a token; you decide what to do with it.

## Try it

```bash
npm install agentauth
```

Repo + docs: https://github.com/s300169140/agentauth

Feedback / PRs / "please add Linear" issues all welcome.
````

---

## Channel 3: X / Twitter thread

Post the same morning as HN. Quote-tweet your HN submission once it's up so traffic compounds.

**Tweet 1** (hook):

> just open-sourced something I needed but couldn't find:
>
> agentauth — OAuth in 3 lines for AI agents that run locally (CLI, MCP servers, desktop apps)
>
> every existing OAuth lib assumes you're a web server with a public callback URL. AI agents aren't that.
>
> 🧵

**Tweet 2:**

> the canonical example: you're building an MCP server that needs to read the user's GitHub issues
>
> with `next-auth` / `auth0` / etc you'd need:
> - a public URL
> - a redirect callback handler
> - express middleware
> - somewhere to host all that
>
> none of which an MCP server has

**Tweet 3** (code):

> with agentauth:
>
> ```ts
> const auth = new AgentAuth({ providers: [github({ clientId })] })
> const { token } = await auth.authorize("github", { scopes: ["repo"] })
> ```
>
> browser opens → user consents → token cached at ~/.agentauth/tokens.json → next run uses cache → auto-refreshes when expired

**Tweet 4:**

> built-in providers: github (device flow), slack + notion (loopback)
>
> custom providers are ~30 lines — write one for any service in an evening
>
> token storage is pluggable, default is JSON-on-disk mode 0600. no keytar dependency (breaks bun/containers)

**Tweet 5** (close):

> repo: github.com/s300169140/agentauth
> npm: npmjs.com/package/agentauth
>
> would love feedback, especially on which provider to add next. linear? google? atlassian?

---

## Channel 4: Awesome lists + community PRs

Background distribution. Submit one per day across a week.

| List | URL | What to add |
|---|---|---|
| awesome-mcp-servers | https://github.com/punkpeye/awesome-mcp-servers | Under "Tools / Auth" |
| awesome-claude-code | search github for "awesome-claude-code" | Under "Libraries" |
| awesome-oauth | https://github.com/dgtlmonk/awesome-oauth | Under "Node.js" or "TypeScript" |
| awesome-typescript | https://github.com/dzharii/awesome-typescript | Under "Auth & Security" |

**PR template** (paste into each list's contributing format):

> ### agentauth
>
> OAuth in 3 lines for AI agents — device flow + loopback flow, multi-provider, file-backed token storage with auto-refresh. Built specifically for CLI, MCP servers, and desktop agents where browser-redirect OAuth doesn't fit.
>
> [github.com/s300169140/agentauth](https://github.com/s300169140/agentauth)

Don't submit if your repo has fewer than 50 stars — looks like spam. Wait until HN gives you that 50.

---

## Tracking

Spreadsheet columns to fill in for the first 7 days:

| Day | npm downloads | GitHub stars | HN points | Top inbound traffic source |
|---|---|---|---|---|

If day 7 shows < 100 weekly npm downloads and < 50 stars, the launch under-performed. Pivot:

1. Add 2 more providers (linear is the most-asked for in MCP communities right now)
2. Write a second dev.to post — angle: "How I added Notion OAuth to my MCP server in 3 lines"
3. Re-post to HN in 3-4 weeks with a new angle ("agentauth v0.2: now with X")

If day 7 shows > 500 stars, you're in the win lane. Start prepping the SaaS layer (Stage 3 of the revenue plan).
