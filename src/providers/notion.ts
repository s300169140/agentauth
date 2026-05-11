/**
 * Notion OAuth provider for agentauth.
 *
 * Uses **loopback flow** — Notion does not support OAuth 2.0 device flow.
 *
 * Setup on the Notion side:
 *   1. https://www.notion.so/my-integrations → New integration
 *      Choose "Public" if your agent is distributed to multiple end-users;
 *      "Internal" if it's just for your workspace
 *   2. OAuth Domain & URLs → Redirect URIs:
 *      add `http://127.0.0.1:8766/callback` (must match `port` option)
 *   3. Copy "OAuth client ID" and "OAuth client secret"
 *
 * Notion tokens are workspace-scoped and never expire (no refresh flow).
 * The token's `meta` carries `workspace_id`, `workspace_name`, `bot_id`.
 */

import type { Provider, ProviderFlowContext, Token } from "../types.js";
import { runLoopback } from "../loopback.js";
import { randomState } from "../util.js";

export interface NotionProviderOptions {
	clientId: string;
	clientSecret: string;
	/** Loopback port. Must match a Redirect URI registered in Notion. Default: 8766. */
	port?: number;
	/**
	 * Owner type the integration installs as. Default "user" matches the most
	 * common case for end-user-facing agents. "workspace" is rare and requires
	 * additional Notion config.
	 */
	owner?: "user" | "workspace";
}

const NOTION_AUTHORIZE = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN = "https://api.notion.com/v1/oauth/token";

interface NotionTokenResponse {
	access_token?: string;
	token_type?: string;
	bot_id?: string;
	workspace_id?: string;
	workspace_name?: string;
	workspace_icon?: string;
	owner?: {
		type: string;
		user?: { id: string; name?: string; person?: { email?: string } };
	};
	duplicated_template_id?: string;
	error?: string;
	error_description?: string;
}

export function notion(opts: NotionProviderOptions): Provider {
	if (!opts.clientId || !opts.clientSecret) {
		throw new Error(
			"agentauth: notion() requires { clientId, clientSecret }. Create an integration at https://www.notion.so/my-integrations.",
		);
	}
	const port = opts.port ?? 8766;
	const owner = opts.owner ?? "user";

	return {
		id: "notion",
		name: "Notion",
		defaultFlow: "loopback",

		async authorizeLoopback(ctx: ProviderFlowContext): Promise<Token> {
			const state = randomState();

			const result = await runLoopback({
				timeoutMs: ctx.options.timeoutMs,
				port,
				log: ctx.log,
				openBrowser: ctx.openBrowser,
				buildAuthUrl: (redirectUri) => {
					const u = new URL(NOTION_AUTHORIZE);
					u.searchParams.set("client_id", opts.clientId);
					u.searchParams.set("redirect_uri", redirectUri);
					u.searchParams.set("response_type", "code");
					u.searchParams.set("owner", owner);
					u.searchParams.set("state", state);
					return u.toString();
				},
			});

			if (result.state !== state) {
				throw new Error(
					"agentauth: Notion callback `state` did not match. This may indicate a CSRF attempt — aborting.",
				);
			}

			// Notion uses HTTP Basic auth for the token exchange — client_id:client_secret
			// base64-encoded as Authorization header, not POST-body params.
			const basic = Buffer.from(
				`${opts.clientId}:${opts.clientSecret}`,
			).toString("base64");
			const exchangeResp = await fetch(NOTION_TOKEN, {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					Authorization: `Basic ${basic}`,
				},
				body: JSON.stringify({
					grant_type: "authorization_code",
					code: result.code,
					redirect_uri: result.redirectUri,
				}),
			});
			const json = (await exchangeResp.json()) as NotionTokenResponse;
			if (!json.access_token) {
				throw new Error(
					`agentauth: Notion token exchange failed: ${json.error ?? "unknown"} ${json.error_description ?? ""}`.trim(),
				);
			}

			const meta: Record<string, unknown> = {};
			if (json.workspace_id) meta.workspaceId = json.workspace_id;
			if (json.workspace_name) meta.workspaceName = json.workspace_name;
			if (json.bot_id) meta.botId = json.bot_id;
			if (json.owner) meta.owner = json.owner;
			if (json.duplicated_template_id)
				meta.duplicatedTemplateId = json.duplicated_template_id;

			const token: Token = {
				// Notion tokens never expire — no expiresAt or refreshToken.
				accessToken: json.access_token,
				scopes: [], // Notion doesn't return scopes; permissions are page-level via "Connections"
				provider: "notion",
				meta,
			};
			const userId = json.owner?.user?.id;
			if (userId) token.account = userId;
			return token;
		},
	};
}
