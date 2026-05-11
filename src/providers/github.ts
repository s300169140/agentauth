/**
 * GitHub OAuth provider for agentauth.
 *
 * Uses GitHub's **device flow** by default — the right choice for CLI / MCP /
 * desktop agents because:
 *   1. No localhost redirect URL to register on the OAuth app
 *   2. Works in containers, SSH sessions, CI, Bun runtime, etc.
 *   3. User can complete authorization on a different device (phone)
 *
 * Setup on the GitHub side:
 *   1. https://github.com/settings/developers → New OAuth App
 *   2. **Important**: tick "Enable Device Flow"
 *   3. Use the resulting Client ID with `github({ clientId: "..." })`
 *
 * Refresh tokens are not standard for GitHub OAuth Apps (they're available for
 * GitHub Apps with `refresh_token` enabled). When unavailable, agentauth will
 * just re-prompt the user when the access token expires, which for GitHub's
 * default OAuth Apps is "never" (tokens are long-lived).
 */

import type { Provider, Token, ProviderFlowContext } from "../types.js"
import { sleep, waitFor } from "../util.js"

export interface GithubProviderOptions {
  /** Client ID of your GitHub OAuth App (with Device Flow enabled). */
  clientId: string
  /**
   * Default scopes if the caller doesn't pass any. Optional — most agents
   * specify scopes per-call to keep the consent prompt accurate.
   */
  defaultScopes?: string[]
  /**
   * Override the OAuth endpoints. Useful for GitHub Enterprise. Defaults to
   * github.com.
   */
  endpoints?: {
    deviceCode?: string
    accessToken?: string
  }
}

const GH_DEVICE_CODE = "https://github.com/login/device/code"
const GH_ACCESS_TOKEN = "https://github.com/login/oauth/access_token"

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface AccessTokenResponse {
  access_token?: string
  token_type?: string
  scope?: string
  refresh_token?: string
  refresh_token_expires_in?: number
  expires_in?: number
  error?: string
  error_description?: string
}

export function github(opts: GithubProviderOptions): Provider {
  if (!opts.clientId) {
    throw new Error(
      "agentauth: github() requires { clientId }. Create an OAuth App at https://github.com/settings/developers and enable Device Flow.",
    )
  }
  const deviceCodeUrl = opts.endpoints?.deviceCode ?? GH_DEVICE_CODE
  const accessTokenUrl = opts.endpoints?.accessToken ?? GH_ACCESS_TOKEN

  return {
    id: "github",
    name: "GitHub",
    defaultFlow: "device",

    async authorizeDevice(ctx: ProviderFlowContext): Promise<Token> {
      const scopes = ctx.scopes.length > 0 ? ctx.scopes : (opts.defaultScopes ?? [])

      // 1. Request a device + user code.
      const codeResp = await fetch(deviceCodeUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: opts.clientId,
          scope: scopes.join(" "),
        }),
      })
      if (!codeResp.ok) {
        throw new Error(
          `agentauth: GitHub device-code request failed (${codeResp.status} ${codeResp.statusText}). Did you enable Device Flow on the OAuth App?`,
        )
      }
      const code = (await codeResp.json()) as DeviceCodeResponse

      // 2. Tell the user where to go and try to open the browser for them.
      ctx.log("")
      ctx.log("┌─────────────────────────────────────────")
      ctx.log(`│ Open: ${code.verification_uri}`)
      ctx.log(`│ Code: ${code.user_code}`)
      ctx.log("└─────────────────────────────────────────")
      ctx.log("")
      const opened = await ctx.openBrowser(code.verification_uri)
      if (opened) {
        ctx.log("(your browser should have opened — paste the code there)")
      } else {
        ctx.log("(no browser detected — open the URL on any device)")
      }

      // 3. Poll until user completes consent (or we hit the device-code expiry).
      const startedAt = Date.now()
      const expiresAtMs = startedAt + code.expires_in * 1000
      const pollLimit = Math.min(ctx.options.timeoutMs, expiresAtMs - startedAt)
      let interval = code.interval

      const result = await waitFor<AccessTokenResponse>(
        async () => {
          const resp = await fetch(accessTokenUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: opts.clientId,
              device_code: code.device_code,
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }),
          })
          const json = (await resp.json()) as AccessTokenResponse

          // GitHub returns 200 with `error` field while polling — these are normal.
          if (json.access_token) return json
          switch (json.error) {
            case "authorization_pending":
              return null
            case "slow_down":
              // RFC 8628: bump interval by 5s and back off.
              interval += 5
              await sleep(interval * 1000)
              return null
            case "expired_token":
              throw new Error(
                "agentauth: GitHub device code expired before consent. Re-run authorize().",
              )
            case "access_denied":
              throw new Error("agentauth: user denied GitHub authorization.")
            default:
              throw new Error(
                `agentauth: GitHub token poll failed: ${json.error ?? "unknown"} ${json.error_description ?? ""}`.trim(),
              )
          }
        },
        {
          timeoutMs: pollLimit,
          intervalMs: interval * 1000,
          label: "GitHub device-code consent",
        },
      )

      // 4. Build the token. GitHub returns space-separated scopes.
      const grantedScopes = (result.scope ?? "").split(/\s+/).filter(Boolean)
      const token: Token = {
        accessToken: result.access_token!,
        scopes: grantedScopes.length > 0 ? grantedScopes : scopes,
        provider: "github",
      }
      if (result.refresh_token) token.refreshToken = result.refresh_token
      if (result.expires_in) {
        token.expiresAt = Math.floor(Date.now() / 1000) + result.expires_in
      }
      return token
    },

    async refresh(token: Token): Promise<Token> {
      if (!token.refreshToken) {
        throw new Error(
          "agentauth: cannot refresh GitHub token without a refresh_token (likely a classic OAuth App without refresh enabled).",
        )
      }
      const resp = await fetch(accessTokenUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: opts.clientId,
          grant_type: "refresh_token",
          refresh_token: token.refreshToken,
        }),
      })
      const json = (await resp.json()) as AccessTokenResponse
      if (!json.access_token) {
        throw new Error(
          `agentauth: GitHub refresh failed: ${json.error ?? "unknown"} ${json.error_description ?? ""}`.trim(),
        )
      }
      const refreshed: Token = {
        ...token,
        accessToken: json.access_token,
        scopes: (json.scope ?? "").split(/\s+/).filter(Boolean) || token.scopes,
      }
      if (json.refresh_token) refreshed.refreshToken = json.refresh_token
      if (json.expires_in) {
        refreshed.expiresAt = Math.floor(Date.now() / 1000) + json.expires_in
      }
      return refreshed
    },
  }
}
