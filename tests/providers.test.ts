import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import { github } from "../src/providers/github";
import { slack } from "../src/providers/slack";
import { notion } from "../src/providers/notion";
import type { ProviderFlowContext } from "../src/types";

// ---------------------------------------------------------------------------
// Construction errors
// ---------------------------------------------------------------------------

test("github() throws when clientId missing", () => {
	expect(() => github({} as never)).toThrow(/clientId/);
});

test("slack() throws when clientId/clientSecret missing", () => {
	expect(() => slack({ clientId: "x" } as never)).toThrow(/clientSecret/);
	expect(() => slack({ clientSecret: "x" } as never)).toThrow(/clientId/);
});

test("notion() throws when clientId/clientSecret missing", () => {
	expect(() => notion({ clientId: "x" } as never)).toThrow(/clientSecret/);
});

// ---------------------------------------------------------------------------
// Provider shape sanity
// ---------------------------------------------------------------------------

test("github provider exposes expected interface", () => {
	const p = github({ clientId: "Iv1.test" });
	expect(p.id).toBe("github");
	expect(p.name).toBe("GitHub");
	expect(p.defaultFlow).toBe("device");
	expect(typeof p.authorizeDevice).toBe("function");
	expect(typeof p.refresh).toBe("function");
});

test("slack provider exposes expected interface", () => {
	const p = slack({ clientId: "x", clientSecret: "y" });
	expect(p.id).toBe("slack");
	expect(p.name).toBe("Slack");
	expect(p.defaultFlow).toBe("loopback");
	expect(typeof p.authorizeLoopback).toBe("function");
	expect(p.refresh).toBeUndefined(); // Slack tokens don't expire
});

test("notion provider exposes expected interface", () => {
	const p = notion({ clientId: "x", clientSecret: "y" });
	expect(p.id).toBe("notion");
	expect(p.name).toBe("Notion");
	expect(p.defaultFlow).toBe("loopback");
	expect(typeof p.authorizeLoopback).toBe("function");
	expect(p.refresh).toBeUndefined(); // Notion tokens don't expire
});

// ---------------------------------------------------------------------------
// GitHub device flow — happy path with mocked fetch
// ---------------------------------------------------------------------------

const realFetch = global.fetch;

beforeEach(() => {
	// mock will be set per-test
});
afterEach(() => {
	global.fetch = realFetch;
});

function ctx(
	overrides: Partial<ProviderFlowContext> = {},
): ProviderFlowContext {
	return {
		scopes: ["repo"],
		log: () => {},
		openBrowser: async () => true,
		options: { timeoutMs: 5000 },
		...overrides,
	};
}

test("github device flow: returns access token after one poll", async () => {
	let call = 0;
	global.fetch = mock(
		async (url: string | URL | Request, init?: RequestInit) => {
			call++;
			const u = String(url);
			if (u.includes("/login/device/code")) {
				return new Response(
					JSON.stringify({
						device_code: "dev-1",
						user_code: "ABCD-EFGH",
						verification_uri: "https://github.com/login/device",
						expires_in: 900,
						interval: 0, // poll immediately for the test
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			if (u.includes("/login/oauth/access_token")) {
				return new Response(
					JSON.stringify({
						access_token: "ghp_test123",
						scope: "repo",
						token_type: "bearer",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			throw new Error(`unexpected fetch: ${u}`);
		},
	) as unknown as typeof fetch;

	const p = github({ clientId: "Iv1.test" });
	const token = await p.authorizeDevice!(ctx());
	expect(token.accessToken).toBe("ghp_test123");
	expect(token.scopes).toEqual(["repo"]);
	expect(token.provider).toBe("github");
	expect(call).toBe(2); // one device-code request, one access-token request
});

test("github device flow: handles `authorization_pending` then success", async () => {
	let pollCount = 0;
	global.fetch = mock(async (url: string | URL | Request) => {
		const u = String(url);
		if (u.includes("/login/device/code")) {
			return new Response(
				JSON.stringify({
					device_code: "dev-1",
					user_code: "ABCD-EFGH",
					verification_uri: "https://github.com/login/device",
					expires_in: 900,
					interval: 0,
				}),
				{ status: 200 },
			);
		}
		if (u.includes("/login/oauth/access_token")) {
			pollCount++;
			if (pollCount < 3) {
				return new Response(
					JSON.stringify({ error: "authorization_pending" }),
					{ status: 200 },
				);
			}
			return new Response(
				JSON.stringify({ access_token: "ghp_x", scope: "repo" }),
				{ status: 200 },
			);
		}
		throw new Error(`unexpected fetch: ${u}`);
	}) as unknown as typeof fetch;

	const p = github({ clientId: "Iv1.test" });
	const token = await p.authorizeDevice!(ctx());
	expect(token.accessToken).toBe("ghp_x");
	expect(pollCount).toBe(3);
});

test("github device flow: rejects on user denial", async () => {
	global.fetch = mock(async (url: string | URL | Request) => {
		const u = String(url);
		if (u.includes("/login/device/code")) {
			return new Response(
				JSON.stringify({
					device_code: "dev-1",
					user_code: "X",
					verification_uri: "https://github.com/login/device",
					expires_in: 900,
					interval: 0,
				}),
				{ status: 200 },
			);
		}
		return new Response(JSON.stringify({ error: "access_denied" }), {
			status: 200,
		});
	}) as unknown as typeof fetch;

	const p = github({ clientId: "Iv1.test" });
	await expect(p.authorizeDevice!(ctx())).rejects.toThrow(/denied/i);
});

test("github refresh: throws when no refresh_token in cached token", async () => {
	const p = github({ clientId: "Iv1.test" });
	await expect(
		p.refresh!({ accessToken: "x", scopes: ["repo"], provider: "github" }),
	).rejects.toThrow(/refresh_token/);
});
