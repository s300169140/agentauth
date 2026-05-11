/**
 * Core types for agentauth.
 *
 * The library is provider-agnostic. A provider is anything that exposes the
 * `Provider` interface — bring your own to support a service we don't ship a
 * built-in for.
 */

/** A single OAuth2 token + metadata, persisted to storage by the library. */
export interface Token {
	/** The bearer access token. Use this in `Authorization: Bearer <token>`. */
	accessToken: string;
	/** Optional refresh token. If present, the library auto-refreshes when expired. */
	refreshToken?: string;
	/** Unix epoch seconds when `accessToken` expires. Undefined = never expires. */
	expiresAt?: number;
	/** Provider-confirmed scopes the token actually has. */
	scopes: string[];
	/** Lowercase provider id, e.g. "github". */
	provider: string;
	/** Optional account hint (login/email/etc.) so multi-account users can disambiguate. */
	account?: string;
	/** Anything provider-specific the library should round-trip without inspecting. */
	meta?: Record<string, unknown>;
}

/** What `authorize()` returns to the caller. */
export interface AuthorizeResult {
	token: Token;
	/**
	 * True if a fresh OAuth flow ran (browser opened, user consented).
	 * False if a cached token was returned without prompting.
	 */
	isNew: boolean;
}

/** Options accepted by every flow. */
export interface AuthorizeOptions {
	/** OAuth scopes to request. Provider-specific names. */
	scopes?: string[];
	/**
	 * Force a fresh flow even if a valid cached token exists.
	 * Default false — a cached non-expired token short-circuits.
	 */
	force?: boolean;
	/**
	 * Account hint for multi-account scenarios. Tokens are stored keyed by
	 * `${provider}:${account ?? "default"}`.
	 */
	account?: string;
	/**
	 * Override which flow the provider uses. Most providers default to the
	 * flow they recommend for desktop/CLI; pass `"device"` to force device
	 * flow even when localhost-callback is supported.
	 */
	flow?: "device" | "loopback";
	/**
	 * Timeout for awaiting user consent, in milliseconds. Default 5 minutes.
	 */
	timeoutMs?: number;
}

/** Storage backend for tokens. */
export interface TokenStorage {
	get(key: string): Promise<Token | null>;
	set(key: string, token: Token): Promise<void>;
	delete(key: string): Promise<void>;
}

/**
 * A provider implements one or both OAuth flows for a specific service.
 * Built-ins live in `src/providers/*`; users can register their own.
 */
export interface Provider {
	/** Unique lowercase identifier, e.g. "github". */
	readonly id: string;
	/** Human-readable name for logging. */
	readonly name: string;
	/** Default flow the provider recommends for agent contexts. */
	readonly defaultFlow: "device" | "loopback";
	/**
	 * Run a device-flow authorization. Library calls this when:
	 *   - flow option is "device", OR
	 *   - flow option is undefined and `defaultFlow === "device"`
	 */
	authorizeDevice?(opts: ProviderFlowContext): Promise<Token>;
	/** Same, for loopback (localhost-callback) flow. */
	authorizeLoopback?(opts: ProviderFlowContext): Promise<Token>;
	/**
	 * Refresh an expired token. Optional — providers without refresh tokens
	 * (e.g. GitHub apps without refresh enabled) can omit this and the library
	 * will trigger a fresh authorize() instead.
	 */
	refresh?(token: Token): Promise<Token>;
}

/** Context the library hands the provider during a flow. */
export interface ProviderFlowContext {
	scopes: string[];
	/** User-friendly logger. Library passes a no-op if the user disabled it. */
	log: (msg: string) => void;
	/** Open a URL in the user's browser. Returns false if no browser available. */
	openBrowser: (url: string) => Promise<boolean>;
	/** Pass-through of the user's authorize() options. */
	options: Required<Pick<AuthorizeOptions, "timeoutMs">> & AuthorizeOptions;
}

/** A no-op storage useful for tests / ephemeral flows. */
export class MemoryTokenStorage implements TokenStorage {
	private map = new Map<string, Token>();
	async get(key: string) {
		return this.map.get(key) ?? null;
	}
	async set(key: string, token: Token) {
		this.map.set(key, token);
	}
	async delete(key: string) {
		this.map.delete(key);
	}
}
