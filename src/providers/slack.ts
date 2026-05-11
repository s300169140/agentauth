/**
 * Slack OAuth provider for agentauth.
 *
 * Uses **loopback flow** — Slack does not support OAuth 2.0 device flow.
 * The library briefly opens an HTTP server on 127.0.0.1, redirects the
 * user's browser to slack.com/oauth/v2/authorize, captures the callback,
 * exchanges the code for a token.
 *
 * Setup on the Slack side:
 *   1. https://api.slack.com/apps → Create New App → From scratch
 *   2. OAuth & Permissions → Redirect URLs:
 *      add `http://127.0.0.1:8765/callback` (must match `port` option)
 *   3. Add the bot/user scopes you'll request from `authorize()`
 *   4. Copy Client ID and Client Secret into `slack({ clientId, clientSecret })`
 *
 * Note on Slack's two token types: `xoxb-` (bot) tokens come back at the top
 * level, `xoxp-` (user) tokens come back nested under `authed_user`. agentauth
 * defaults to bot tokens; pass `tokenType: "user"` to get the user token instead.
 */

import type { Provider, ProviderFlowContext, Token } from "../types.js";
import { runLoopback } from "../loopback.js";
import { randomState } from "../util.js";

export interface SlackProviderOptions {
	clientId: string;
	clientSecret: string;
	/** Default scopes if caller passes none. */
	defaultScopes?: string[];
	/**
	 * Loopback port the server listens on. MUST match a Redirect URL registered
	 * in the Slack app config. Default: 8765.
	 */
	port?: number;
	/**
	 * Slack returns both bot and user tokens. Default "bot" returns the
	 * `xoxb-` token (Slack apps that act as bots). Pass "user" for `xoxp-`.
	 */
	tokenType?: "bot" | "user";
}

const SLACK_AUTHORIZE = "https://slack.com/oauth/v2/authorize";
const SLACK_ACCESS = "https://slack.com/api/oauth.v2.access";

interface SlackOAuthResponse {
	ok: boolean;
	error?: string;
	access_token?: string;
	token_type?: string;
	scope?: string;
	bot_user_id?: string;
	app_id?: string;
	team?: { id: string; name: string };
	authed_user?: {
		id: string;
		scope?: string;
		access_token?: string;
		token_type?: string;
	};
}

export function slack(opts: SlackProviderOptions): Provider {
	if (!opts.clientId || !opts.clientSecret) {
		throw new Error(
			"agentauth: slack() requires { clientId, clientSecret }. Create an app at https://api.slack.com/apps.",
		);
	}
	const port = opts.port ?? 8765;
	const tokenType = opts.tokenType ?? "bot";

	return {
		id: "slack",
		name: "Slack",
		defaultFlow: "loopback",

		async authorizeLoopback(ctx: ProviderFlowContext): Promise<Token> {
			const scopes =
				ctx.scopes.length > 0 ? ctx.scopes : (opts.defaultScopes ?? []);
			const state = randomState();

			// Slack splits "bot scopes" from "user scopes" in the authorize URL.
			// We pass everything to `scope` (bot) by default; users wanting user
			// scopes can construct a custom provider that overrides this method.
			// For the simple case this is the right shape.
			const result = await runLoopback({
				timeoutMs: ctx.options.timeoutMs,
				port,
				log: ctx.log,
				openBrowser: ctx.openBrowser,
				buildAuthUrl: (redirectUri) => {
					const u = new URL(SLACK_AUTHORIZE);
					u.searchParams.set("client_id", opts.clientId);
					u.searchParams.set("redirect_uri", redirectUri);
					u.searchParams.set("state", state);
					if (tokenType === "user") {
						u.searchParams.set("user_scope", scopes.join(","));
					} else {
						u.searchParams.set("scope", scopes.join(","));
					}
					return u.toString();
				},
			});

			if (result.state !== state) {
				throw new Error(
					"agentauth: Slack callback `state` did not match. This may indicate a CSRF attempt — aborting.",
				);
			}

			// Exchange code for token.
			const exchangeResp = await fetch(SLACK_ACCESS, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: opts.clientId,
					client_secret: opts.clientSecret,
					code: result.code,
					redirect_uri: result.redirectUri,
				}),
			});
			const json = (await exchangeResp.json()) as SlackOAuthResponse;
			if (!json.ok) {
				throw new Error(
					`agentauth: Slack token exchange failed: ${json.error ?? "unknown"}`,
				);
			}

			const meta: Record<string, unknown> = {};
			if (json.team) meta.teamId = json.team.id;
			if (json.team?.name) meta.teamName = json.team.name;
			if (json.bot_user_id) meta.botUserId = json.bot_user_id;
			if (json.app_id) meta.appId = json.app_id;

			if (tokenType === "user") {
				const user = json.authed_user;
				if (!user?.access_token) {
					throw new Error(
						"agentauth: Slack returned bot token only — did you request `user_scope` scopes? Check Slack app config.",
					);
				}
				return {
					accessToken: user.access_token,
					scopes: (user.scope ?? "").split(",").filter(Boolean),
					provider: "slack",
					account: user.id,
					meta,
				};
			}

			if (!json.access_token) {
				throw new Error(
					"agentauth: Slack response missing top-level access_token. Did you request bot scopes?",
				);
			}
			const token: Token = {
				accessToken: json.access_token,
				scopes: (json.scope ?? "").split(",").filter(Boolean),
				provider: "slack",
				meta,
			};
			if (json.bot_user_id) token.account = json.bot_user_id;
			return token;
		},
	};
}
