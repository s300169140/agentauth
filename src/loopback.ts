/**
 * Loopback (localhost-callback) OAuth flow helper.
 *
 * Spins up a one-shot HTTP server on 127.0.0.1, opens the user's browser to
 * the provider's authorize URL with a redirect_uri pointing at our temp
 * server, captures the callback, returns the {code, state} to the provider
 * implementation for token exchange.
 *
 * Why localhost instead of a public callback URL: AI agents run locally on
 * the user's machine. They don't have a public URL. Localhost is the
 * RFC 8252 (OAuth 2.0 for Native Apps) recommended pattern.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Result of a successful loopback flow. */
export interface LoopbackResult {
	/** The `code` query param the provider redirected with. */
	code: string;
	/** The `state` query param. Caller should compare to the value they sent. */
	state: string | null;
	/** The full redirect URI the server listened on. Pass to provider for code exchange. */
	redirectUri: string;
}

/** Options for `runLoopback()`. */
export interface LoopbackOptions {
	/**
	 * Function that, given the redirect URI we listen on, returns the full
	 * authorize URL to open in the user's browser. The caller must include
	 * `redirect_uri` and `state` in the URL.
	 */
	buildAuthUrl: (redirectUri: string) => string;
	/** Open this URL in the user's browser. */
	openBrowser: (url: string) => Promise<boolean>;
	/** Logger for status updates. */
	log: (msg: string) => void;
	/** How long to wait for the user before giving up. */
	timeoutMs: number;
	/**
	 * Path the provider redirects to. Default `/callback`. Some providers
	 * require an exact registered redirect URI, in which case match it here.
	 */
	callbackPath?: string;
	/**
	 * Specific port to bind. Default 0 (OS picks). Some providers require
	 * exact registered redirect URIs including port — pass it here.
	 */
	port?: number;
}

/**
 * Run a loopback OAuth flow end-to-end. Returns the auth code on success,
 * throws on timeout / user-denial / server error.
 */
export async function runLoopback(
	opts: LoopbackOptions,
): Promise<LoopbackResult> {
	const callbackPath = opts.callbackPath ?? "/callback";
	const port = opts.port ?? 0;

	let server: Server | undefined;
	try {
		const result = await new Promise<LoopbackResult>((resolve, reject) => {
			const timeoutHandle = setTimeout(() => {
				reject(
					new Error(
						`agentauth: loopback callback timed out after ${opts.timeoutMs}ms. User may have closed the browser without consenting.`,
					),
				);
			}, opts.timeoutMs);

			server = createServer((req, res) => {
				// Parse the URL the provider redirected with.
				const url = new URL(
					req.url ?? "/",
					`http://127.0.0.1:${(server!.address() as AddressInfo).port}`,
				);

				// Only respond to our callback path; ignore favicon etc.
				if (url.pathname !== callbackPath) {
					res.writeHead(404);
					res.end("Not found");
					return;
				}

				const code = url.searchParams.get("code");
				const state = url.searchParams.get("state");
				const error = url.searchParams.get("error");
				const errorDescription = url.searchParams.get("error_description");

				// Show the user a friendly page so they know to close the tab.
				const success = code && !error;
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(
					successOrErrorPage(
						success ? "success" : "error",
						errorDescription ?? error ?? undefined,
					),
				);

				clearTimeout(timeoutHandle);

				if (error) {
					reject(
						new Error(
							`agentauth: provider returned error "${error}"${errorDescription ? `: ${errorDescription}` : ""}`,
						),
					);
					return;
				}
				if (!code) {
					reject(
						new Error("agentauth: callback received with no `code` parameter"),
					);
					return;
				}

				resolve({
					code,
					state,
					redirectUri: `http://127.0.0.1:${(server!.address() as AddressInfo).port}${callbackPath}`,
				});
			});

			server.on("error", (err) => {
				clearTimeout(timeoutHandle);
				reject(new Error(`agentauth: loopback server error: ${err.message}`));
			});

			server.listen(port, "127.0.0.1", () => {
				const actualPort = (server!.address() as AddressInfo).port;
				const redirectUri = `http://127.0.0.1:${actualPort}${callbackPath}`;
				const authUrl = opts.buildAuthUrl(redirectUri);

				opts.log("");
				opts.log("┌─────────────────────────────────────────");
				opts.log(`│ Open: ${authUrl}`);
				opts.log("└─────────────────────────────────────────");
				opts.log("");
				opts.openBrowser(authUrl).then((opened) => {
					if (opened) {
						opts.log(
							"(your browser should have opened — complete authorization there)",
						);
					} else {
						opts.log(
							"(no browser detected — open the URL above on this machine)",
						);
					}
				});
			});
		});
		return result;
	} finally {
		if (server) server.close();
	}
}

function successOrErrorPage(
	kind: "success" | "error",
	detail?: string,
): string {
	const heading =
		kind === "success" ? "✓ Authorized" : "✗ Authorization failed";
	const body =
		kind === "success"
			? "You can close this tab and return to your terminal."
			: `Something went wrong: ${detail ?? "unknown error"}. Return to your terminal for details.`;
	const color = kind === "success" ? "#10b981" : "#ef4444";
	return `<!doctype html>
<html><head><title>agentauth</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 16px/1.5 -apple-system, system-ui, sans-serif; background: #fafafa;
         color: #111; padding: 4rem 1rem; max-width: 28rem; margin: 0 auto; text-align: center; }
  h1 { color: ${color}; font-size: 1.5rem; margin: 0 0 1rem; }
  p { color: #555; margin: 0; }
  code { background: #eee; padding: 0.1em 0.4em; border-radius: 0.25rem; font-size: 0.85em; }
</style></head>
<body><h1>${heading}</h1><p>${body}</p>
<p style="margin-top:2rem;font-size:0.85em;"><code>agentauth</code></p>
</body></html>`;
}
