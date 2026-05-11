# Launch playbook

The package is live as `@oauthkit/agentauth` on npm. This file is the playbook for getting it in front of the right developers.

**Brand vs npm name:** the *project* is **agentauth**. The *package* is `@oauthkit/agentauth`. Use the short brand name in titles + prose, the scoped name in install commands and code samples.

---

## Where to post — ranked by realistic ROI

You won't have time to do all of these. Pick the top 3, do them well.

| Channel | Effort | Best-case reach | Realistic outcome | When to do it |
|---|---|---|---|---|
| **1. Hacker News (Show HN)** | 30 min to write, 4-6h to babysit | 50k+ pageviews, 200-2000 stars | 1-3 in 10 hit front page; rest get 5-50 points | First — sets the narrative |
| **2. r/LocalLLaMA + r/MachineLearning** | 15 min | 5-20k pageviews | 50-300 upvotes if the title resonates | Same day as HN |
| **3. dev.to article** | 1 hour to write | Slow burn, 500-5k views over weeks | SEO-friendly long tail | 1-2 days after HN |
| **4. MCP community Discord** | 10 min | small (~1k members) but EXACTLY your audience | 5-30 stars, real users + feedback | Same day as HN |
| **5. Awesome list PRs** | 20 min total | Steady trickle | +20-50 stars/month long-term | After you have 50 stars |
| **6. X/Twitter thread** | 15 min | Depends on existing follower count | If you have <1k followers, near zero unless quote-tweeted | Same day as HN |
| **7. r/programming, r/javascript** | 5 min | Highly variable | Often <10 upvotes; sometimes 500+ | Backup if HN underperforms |

**My honest pick if you only do ONE thing**: Show HN. It's the only channel where a no-name developer with no audience can land 50k pageviews in a day. Everything else compounds off HN's signal.

---

## Channel 1: Hacker News (Show HN) — DO THIS FIRST

**Best window**: weekday, **7-9am Pacific Time** (= 3-5pm UTC = 10am-12pm Eastern). Tuesday or Wednesday for best sustained traffic. Avoid:
- Mondays (HN noise from weekend backlog)
- Fridays (low retention into weekend)
- Major news days (when HN is dominated by current events)

**URL to submit**: https://news.ycombinator.com/submit

**Title** (must start with "Show HN:"; max 80 chars):

> Show HN: Agentauth – OAuth in 3 lines for AI agents (CLI, MCP, desktop)

**URL field**: leave empty if posting as a "tell HN" with text body, OR put `https://github.com/s300169140/agentauth` if posting as a link. **My pick: link to the GitHub repo** — HN ranks link posts slightly higher than text, and the README is the strongest landing page.

**Text body** (HN strips most markdown — write in plain prose with blank-line paragraphs):

```
Hey HN — I built agentauth because every existing OAuth library I tried assumed the same thing: my "app" was a web server with a public URL like myapp.com/auth/callback.

That's wrong for AI agents. They run as a CLI the user just `npx`'d, an MCP server spawned by Claude Desktop / Cline / Cursor, or a background process in CI. None of them have a public URL. So you can't use next-auth, clerk, auth0, or any of the usual suspects without contortions.

agentauth handles the two flows that actually fit those contexts: device flow (where the user sees a code and types it on any browser, à la `gh auth login`) and loopback flow (briefly listen on 127.0.0.1, open the user's browser to the provider, capture the redirect). Both wrapped behind a single API:

  const auth = new AgentAuth({ providers: [github({ clientId })] })
  const { token } = await auth.authorize("github", { scopes: ["repo"] })

That's the whole user-facing surface. Browser opens, user clicks Authorize, token cached at ~/.agentauth/tokens.json (mode 0600, atomic writes), auto-refreshes when expired. No server. No redirect URL. No Express middleware.

Built-in providers: GitHub (device flow), Slack and Notion (loopback). Custom providers are ~30 lines; the README has a worked example. ~14 KB minzipped, zero runtime dependencies (just Node built-ins + native fetch). Works on Node 18+ and Bun.

What it explicitly is NOT:
  - A full IAM platform (use Okta / Auth0 for that)
  - Server-side OAuth (use openid-client)
  - A token vault for sharing across teammates (single-user-on-their-own-machine; the SaaS for shared tokens may come later if there's demand)
  - Opinionated about your AI framework — it returns a token, you decide what to do with it

I deliberately avoided keytar / native OS keychain bindings — they need a node-gyp build that breaks `npx`-style usage on Bun, minimal containers, and CI. Default storage is JSON-on-disk at mode 0600. Bring your own TokenStorage if you want OS keychain backing.

GitHub: https://github.com/s300169140/agentauth
npm: https://www.npmjs.com/package/@oauthkit/agentauth

Feedback welcome — particularly on which provider to add next (Linear? Google? Atlassian? Discord?), and whether the Provider plugin shape feels right for your use case.
```

### After posting on HN

1. **First 60 minutes**: don't reply to your own thread. Let people upvote based on the title alone. Self-replies look like "shilling" and HN moderators downrank.
2. **Hours 1-6**: reply to every substantive comment within 30 minutes. Engagement keeps you on the front page; abandoned threads slip down fast.
3. **Tone in replies**:
   - If someone says "what about library X?" → name what's actually different about agentauth, don't dismiss the alternative. ("X is great for the server case; the device-flow polling logic is the bit that's different here.")
   - If someone calls it useless / "just use [thing]" → don't argue. Reply once acknowledging the alternative, move on.
   - If someone files a bug or asks a feature → "filing now" + actually file it on GitHub before the thread dies.
4. **Don't ask for stars**. Crass and counterproductive on HN.
5. **Stick around for 4-6 hours** after posting. Engagement is what keeps you on the front page.

---

## Channel 2: Reddit (r/LocalLLaMA, r/MachineLearning)

Same day as HN, ~2 hours after posting (don't compete with yourself for attention).

### r/LocalLLaMA

URL: https://reddit.com/r/LocalLLaMA/submit

**Title:**

> I built a small library for adding OAuth to local AI agents (MCP servers, CLI, desktop) — would love feedback

**Body:**

```
For everyone building MCP servers / Claude Code plugins / Cursor extensions, I kept hitting the same problem: how do I let my agent read the user's GitHub issues / post to their Slack / query their Notion, without making them paste raw API tokens?

Existing OAuth libraries on npm assume my code is a web server with a public callback URL. MCP servers and CLIs aren't that. So I wrote a small library specifically for the "I run on the user's machine" case:

@oauthkit/agentauth — github.com/s300169140/agentauth

Two OAuth flows packaged behind one API:
- Device flow (GitHub, Google) — user sees a code, types it on any browser
- Loopback flow (Slack, Notion) — briefly listen on 127.0.0.1, capture the callback

3 built-in providers (GitHub, Slack, Notion), custom providers are ~30 lines. ~14 KB, no native dependencies (works in Bun and minimal containers).

Curious whether anyone here has solved this differently — and which provider you'd want next.
```

### r/MachineLearning

Stricter mod policy; only post here if your post has a clear "made this for the community" angle. The r/LocalLLaMA framing above usually fits better.

---

## Channel 3: dev.to article

Post 1-2 days after HN — different audience, less startup-noise. dev.to drives sustained organic traffic via SEO long-term.

URL: https://dev.to/new

**Title:**

> I built an OAuth library specifically for AI agents — here's why "just use Auth0" doesn't work

**Tags:** `#javascript`, `#typescript`, `#opensource`, `#ai`, `#oauth`

**Cover image:** generate a simple one in Canva — black background, "agentauth" in a monospace font, subtitle "OAuth in 3 lines for AI agents." 90 seconds.

**Body** (dev.to supports full markdown):

````markdown
Last week I needed to add GitHub auth to an MCP server. I figured I'd grab whatever the standard npm package is, drop it in, ship.

I was wrong.

Every OAuth library on npm — `@octokit/auth-oauth-app`, `next-auth`, `clerk`, `auth0`, `openid-client` — assumes you have a web server with a public URL like `myapp.com/auth/callback`. The flow goes: user clicks "Connect GitHub", browser redirects to GitHub, GitHub redirects back to your callback URL, you exchange the code for a token.

Now imagine your "app" is an MCP server spawned by Claude Desktop. Or a CLI the user just `npx`'d. Or a desktop app with no server. **You don't have a public URL.** You can't have one. The whole library shape is wrong for you.

So I wrote [`@oauthkit/agentauth`](https://github.com/s300169140/agentauth). It does OAuth specifically for the contexts AI agents actually live in: CLIs, MCP servers, desktop apps, anything running locally on the user's machine.

```ts
import { AgentAuth } from "@oauthkit/agentauth"
import { github } from "@oauthkit/agentauth/providers/github"

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

**Device flow (RFC 8628)** — for providers like GitHub. Library gets a device + user code, prints `Open https://github.com/login/device, enter ABCD-EFGH`, polls until the user consents on any browser. Works in containers, SSH sessions, Bun, no localhost needed.

**Loopback flow (RFC 8252)** — for providers without device flow (Slack, Notion). Library briefly listens on `127.0.0.1:RANDOM_PORT/callback`, opens the user's browser to the provider, captures the callback. Server shuts down immediately after the code arrives.

Token persistence is a JSON file at `~/.agentauth/tokens.json` with mode 0600 (POSIX) — atomic writes via rename. I deliberately did NOT depend on `keytar` / native OS keychain — those require a node-gyp build that breaks `npx`-style usage on Bun, minimal containers, CI. Users who want OS keychain backing can implement `TokenStorage` themselves in 30 lines.

## What it doesn't try to be

- **Not a full IAM platform.** Okta, Auth0, Clerk own that space. Different problem.
- **Not server-side OAuth.** `openid-client` does that better than I ever will.
- **Not a token vault.** Single-user-on-their-own-machine. Sharing tokens across teammates is a different product (a hosted SaaS — coming if there's demand).
- **Not opinionated about your AI framework.** Returns a token; you decide what to do with it.

## Try it

```bash
npm install @oauthkit/agentauth
```

Repo + docs: https://github.com/s300169140/agentauth

Feedback / PRs / "please add Linear" issues all welcome.
````

---

## Channel 4: MCP / Claude Code Discord communities

Same day as HN, ~3 hours after posting. These have small audiences but they ARE your target users.

| Community | Channel | What to post |
|---|---|---|
| Anthropic Discord | `#claude-code` or `#community-projects` | Quick announcement + GitHub link |
| MCP server community | `#showcase` | Same |
| Cursor Discord | `#community` | Same, framed for Cursor users |
| Cline Discord | `#showcase` | Same |

**Message template** (one paragraph, link, ask):

> Just open-sourced `@oauthkit/agentauth` — small TypeScript lib for adding OAuth to MCP servers / CLIs / Claude Code plugins. Existing OAuth libs assume you're a web server; this one does device flow + loopback for the local-process case. 3 providers built in (GitHub, Slack, Notion), custom providers are ~30 lines.
>
> github.com/s300169140/agentauth — npm: `@oauthkit/agentauth`
>
> Would love feedback on the Provider shape from anyone building MCP servers, especially what to add next.

Don't post the same message in 6 channels in 6 minutes — that's spam. Pick the 2-3 most relevant, space by 1-2 hours.

---

## Channel 5: X / Twitter thread

If you have <1k followers, this barely moves traffic. But it costs 15 min and the URL might get picked up by larger accounts. Worth doing AFTER the HN post is up so you can quote-tweet your own HN submission.

**Tweet 1** (hook):

> just open-sourced something I needed but couldn't find:
>
> agentauth — OAuth in 3 lines for AI agents that run locally (CLIs, MCP servers, desktop apps)
>
> every existing OAuth lib assumes you're a web server with a public callback URL. AI agents aren't that.
>
> 🧵

**Tweet 2** (problem):

> the canonical example: you're building an MCP server that needs to read the user's GitHub issues
>
> with `next-auth` / `auth0` / etc you'd need:
> – a public URL
> – a redirect callback handler
> – express middleware
> – somewhere to host all that
>
> none of which an MCP server has

**Tweet 3** (solution, code):

> with agentauth:
>
> ```ts
> const auth = new AgentAuth({ providers: [github({ clientId })] })
> const { token } = await auth.authorize("github", { scopes: ["repo"] })
> ```
>
> browser opens → user consents → token cached at ~/.agentauth/tokens.json → next run uses cache → auto-refreshes when expired

**Tweet 4** (specs):

> built-in providers: github (device flow), slack + notion (loopback)
>
> custom providers are ~30 lines — write one for any service in an evening
>
> ~14kb minzipped, zero runtime deps, works on bun + node 18+, no native bindings (no keytar)

**Tweet 5** (close):

> repo: github.com/s300169140/agentauth
> npm: npmjs.com/package/@oauthkit/agentauth
>
> would love feedback, especially: which provider to add next? Linear? Google? Atlassian?

---

## Channel 6: Awesome list PRs (after 50 stars)

Don't submit if your repo has fewer than 50 stars — looks like spam to maintainers and you risk a "promotional" rejection that bars you from re-submitting later. **Wait until HN gives you that 50.**

| List | URL | Section |
|---|---|---|
| awesome-mcp-servers | https://github.com/punkpeye/awesome-mcp-servers | "Frameworks" or "Tools / Auth" |
| awesome-claude-code | search github for current best fork | "Libraries" or "Helpers" |
| awesome-oauth | https://github.com/dgtlmonk/awesome-oauth | "Node.js" |
| awesome-typescript | https://github.com/dzharii/awesome-typescript | "Auth & Security" |

**PR template** (paste into each list's contributing format):

> ### agentauth
>
> OAuth in 3 lines for AI agents — device flow + loopback flow, multi-provider, file-backed token storage with auto-refresh. Built specifically for CLI, MCP servers, and desktop agents where browser-redirect OAuth doesn't fit.
>
> Repo: [github.com/s300169140/agentauth](https://github.com/s300169140/agentauth) · npm: [`@oauthkit/agentauth`](https://www.npmjs.com/package/@oauthkit/agentauth)

---

## Day-by-day timeline (recommended)

| Day | Action | Why |
|---|---|---|
| **Tue/Wed 7am PT** | Post Show HN with link to GitHub repo | Best traffic window |
| **Tue/Wed 9am PT** | Post r/LocalLLaMA | After HN momentum starts |
| **Tue/Wed 10am PT** | Post in 2-3 Discord communities | Direct to target users |
| **Tue/Wed 12pm PT** | Tweet thread, quote-tweet HN | Compound off HN traffic |
| **Wed/Thu** | Publish dev.to article | Different audience, SEO |
| **Sat/Sun** | Re-share HN post on social if it did well | Weekend reposts work |
| **+1 week** | Submit to awesome lists (if >50 stars) | Long-tail discovery |
| **+2 weeks** | Ship v0.2 with most-requested provider | Re-engage early users |

---

## Tracking

Open a spreadsheet. Fill in daily for 7 days:

| Day | npm dl/day | GH stars | HN points | Top traffic source |
|---|---|---|---|---|

**Floor**: <100 weekly npm downloads + <50 stars at day 7 = under-performance. Pivot to:
1. Add Linear provider (most-requested in MCP communities)
2. Re-launch with new dev.to angle: "How I added Notion OAuth to my MCP server in 3 lines"
3. Re-post to HN in 3-4 weeks with "agentauth v0.2: now with X" framing

**Ceiling**: >500 stars at day 7 = win lane. Start prepping the SaaS layer (token vault for teams). That's where the actual money is.
