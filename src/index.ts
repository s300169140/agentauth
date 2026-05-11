/**
 * agentauth — OAuth in 3 lines for AI agents.
 *
 * Quick start:
 *
 * ```ts
 * import { AgentAuth } from "agentauth"
 * import { github } from "agentauth/providers/github"
 *
 * const auth = new AgentAuth({ providers: [github({ clientId: "..." })] })
 * const { token } = await auth.authorize("github", { scopes: ["repo"] })
 * // → use token.accessToken in your API calls
 * ```
 */

import { FileTokenStorage } from "./storage.js"
import {
  type AuthorizeOptions,
  type AuthorizeResult,
  type Provider,
  type ProviderFlowContext,
  type Token,
  type TokenStorage,
} from "./types.js"
import { isExpired, openBrowser } from "./util.js"

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

export interface AgentAuthOptions {
  /** Providers the user has registered. Add more later via `register()`. */
  providers?: Provider[]
  /** Token persistence backend. Default: file at ~/.agentauth/tokens.json. */
  storage?: TokenStorage
  /**
   * Logger called with status messages during a flow ("Open this URL...",
   * "Polling for confirmation...", etc.). Default: console.error. Pass
   * `false` to silence.
   */
  log?: ((msg: string) => void) | false
}

export class AgentAuth {
  private readonly providers = new Map<string, Provider>()
  private readonly storage: TokenStorage
  private readonly log: (msg: string) => void

  constructor(opts: AgentAuthOptions = {}) {
    this.storage = opts.storage ?? new FileTokenStorage()
    this.log = opts.log === false ? () => {} : (opts.log ?? defaultLog)
    for (const p of opts.providers ?? []) this.register(p)
  }

  /** Register a provider after construction (or override a built-in). */
  register(provider: Provider): void {
    this.providers.set(provider.id, provider)
  }

  /**
   * Get an OAuth token for a provider, prompting the user through a flow only
   * if no valid cached token exists.
   *
   * Returns `{ token, isNew }` where `isNew` is true if a fresh flow ran.
   */
  async authorize(
    providerId: string,
    options: AuthorizeOptions = {},
  ): Promise<AuthorizeResult> {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new Error(
        `agentauth: provider "${providerId}" not registered. Call \`auth.register(myProvider)\` first.`,
      )
    }

    const key = storageKey(providerId, options.account)

    // 1) Try the cache unless force=true.
    if (!options.force) {
      const cached = await this.storage.get(key)
      if (cached && !isExpired(cached.expiresAt)) {
        if (scopesSatisfied(options.scopes ?? [], cached.scopes)) {
          return { token: cached, isNew: false }
        }
      }

      // 2) Try refresh if we have a refresh token.
      if (
        cached &&
        cached.refreshToken &&
        provider.refresh &&
        scopesSatisfied(options.scopes ?? [], cached.scopes)
      ) {
        try {
          const refreshed = await provider.refresh(cached)
          await this.storage.set(key, refreshed)
          return { token: refreshed, isNew: false }
        } catch (err) {
          this.log(
            `agentauth: refresh failed for ${provider.name}, falling back to fresh authorize. (${(err as Error).message})`,
          )
        }
      }
    }

    // 3) Run a fresh flow.
    const flow = options.flow ?? provider.defaultFlow
    const ctx: ProviderFlowContext = {
      scopes: options.scopes ?? [],
      log: this.log,
      openBrowser,
      options: { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, ...options },
    }

    let token: Token
    if (flow === "device") {
      if (!provider.authorizeDevice) {
        throw new Error(
          `agentauth: provider "${providerId}" does not support device flow. Try { flow: "loopback" }.`,
        )
      }
      token = await provider.authorizeDevice(ctx)
    } else {
      if (!provider.authorizeLoopback) {
        throw new Error(
          `agentauth: provider "${providerId}" does not support loopback flow. Try { flow: "device" }.`,
        )
      }
      token = await provider.authorizeLoopback(ctx)
    }

    // Stamp account hint if caller provided one and provider didn't override.
    if (options.account && !token.account) {
      token.account = options.account
    }

    await this.storage.set(key, token)
    return { token, isNew: true }
  }

  /** Forget a stored token. Caller must re-authorize next time. */
  async logout(providerId: string, account?: string): Promise<void> {
    await this.storage.delete(storageKey(providerId, account))
  }
}

function storageKey(providerId: string, account?: string): string {
  return `${providerId.toLowerCase()}:${account ?? "default"}`
}

function scopesSatisfied(requested: string[], have: string[]): boolean {
  if (requested.length === 0) return true
  const haveSet = new Set(have)
  return requested.every((s) => haveSet.has(s))
}

function defaultLog(msg: string): void {
  // We log to stderr so the library is safe to use in code that pipes stdout
  // (e.g. CLIs that emit JSON results).
  process.stderr.write(`${msg}\n`)
}

// Re-exports for downstream packages.
export type {
  AuthorizeOptions,
  AuthorizeResult,
  Provider,
  ProviderFlowContext,
  Token,
  TokenStorage,
} from "./types.js"
export { FileTokenStorage, defaultStoragePath } from "./storage.js"
export { MemoryTokenStorage } from "./types.js"
