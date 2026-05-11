import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	AgentAuth,
	FileTokenStorage,
	MemoryTokenStorage,
	type Provider,
	type Token,
} from "../src/index";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mockProvider(opts: {
	id?: string;
	initial?: Token;
	onAuthorize?: () => Promise<Token>;
	onRefresh?: (token: Token) => Promise<Token>;
	defaultFlow?: "device" | "loopback";
}): Provider {
	const id = opts.id ?? "mock";
	const provider: Provider = {
		id,
		name: id,
		defaultFlow: opts.defaultFlow ?? "device",
	};
	if (opts.onAuthorize) {
		if (provider.defaultFlow === "device")
			provider.authorizeDevice = opts.onAuthorize;
		else provider.authorizeLoopback = opts.onAuthorize;
	}
	if (opts.onRefresh) provider.refresh = opts.onRefresh;
	return provider;
}

const NEVER = undefined as number | undefined;

// ---------------------------------------------------------------------------
// authorize() — happy paths
// ---------------------------------------------------------------------------

test("authorize() with no cache runs the flow and stores the token", async () => {
	let calls = 0;
	const provider = mockProvider({
		onAuthorize: async () => {
			calls++;
			return {
				accessToken: "tok-1",
				scopes: ["read"],
				provider: "mock",
				expiresAt: NEVER,
			};
		},
	});
	const auth = new AgentAuth({
		providers: [provider],
		storage: new MemoryTokenStorage(),
		log: false,
	});

	const result = await auth.authorize("mock", { scopes: ["read"] });
	expect(result.isNew).toBe(true);
	expect(result.token.accessToken).toBe("tok-1");
	expect(calls).toBe(1);
});

test("authorize() reuses a cached non-expired token without re-running flow", async () => {
	let calls = 0;
	const provider = mockProvider({
		onAuthorize: async () => {
			calls++;
			return {
				accessToken: "tok-fresh",
				scopes: ["read"],
				provider: "mock",
			};
		},
	});
	const storage = new MemoryTokenStorage();
	await storage.set("mock:default", {
		accessToken: "tok-cached",
		scopes: ["read"],
		provider: "mock",
	});
	const auth = new AgentAuth({ providers: [provider], storage, log: false });

	const result = await auth.authorize("mock", { scopes: ["read"] });
	expect(result.isNew).toBe(false);
	expect(result.token.accessToken).toBe("tok-cached");
	expect(calls).toBe(0);
});

test("authorize() with force=true ignores cache", async () => {
	const provider = mockProvider({
		onAuthorize: async () => ({
			accessToken: "tok-fresh",
			scopes: [],
			provider: "mock",
		}),
	});
	const storage = new MemoryTokenStorage();
	await storage.set("mock:default", {
		accessToken: "tok-cached",
		scopes: [],
		provider: "mock",
	});
	const auth = new AgentAuth({ providers: [provider], storage, log: false });

	const result = await auth.authorize("mock", { force: true });
	expect(result.isNew).toBe(true);
	expect(result.token.accessToken).toBe("tok-fresh");
});

// ---------------------------------------------------------------------------
// Expiry + refresh
// ---------------------------------------------------------------------------

test("expired cached token triggers refresh when refresh() is provided", async () => {
	let refreshCalls = 0;
	const provider = mockProvider({
		onAuthorize: async () => {
			throw new Error("authorize() should not be called when refresh succeeds");
		},
		onRefresh: async (t) => {
			refreshCalls++;
			return {
				...t,
				accessToken: "tok-refreshed",
				expiresAt: Math.floor(Date.now() / 1000) + 3600,
			};
		},
	});
	const storage = new MemoryTokenStorage();
	await storage.set("mock:default", {
		accessToken: "tok-stale",
		refreshToken: "rt-1",
		scopes: ["read"],
		provider: "mock",
		expiresAt: Math.floor(Date.now() / 1000) - 60, // expired
	});
	const auth = new AgentAuth({ providers: [provider], storage, log: false });

	const result = await auth.authorize("mock", { scopes: ["read"] });
	expect(refreshCalls).toBe(1);
	expect(result.token.accessToken).toBe("tok-refreshed");
	expect(result.isNew).toBe(false);
});

test("expired token without refresh triggers fresh authorize", async () => {
	let authorizeCalls = 0;
	const provider = mockProvider({
		onAuthorize: async () => {
			authorizeCalls++;
			return { accessToken: "tok-new", scopes: ["read"], provider: "mock" };
		},
	});
	const storage = new MemoryTokenStorage();
	await storage.set("mock:default", {
		accessToken: "tok-stale",
		scopes: ["read"],
		provider: "mock",
		expiresAt: Math.floor(Date.now() / 1000) - 60,
	});
	const auth = new AgentAuth({ providers: [provider], storage, log: false });

	const result = await auth.authorize("mock", { scopes: ["read"] });
	expect(authorizeCalls).toBe(1);
	expect(result.token.accessToken).toBe("tok-new");
	expect(result.isNew).toBe(true);
});

test("refresh failure falls back to fresh authorize", async () => {
	let authorizeCalls = 0;
	const provider = mockProvider({
		onAuthorize: async () => {
			authorizeCalls++;
			return { accessToken: "tok-new", scopes: ["read"], provider: "mock" };
		},
		onRefresh: async () => {
			throw new Error("refresh server is down");
		},
	});
	const storage = new MemoryTokenStorage();
	await storage.set("mock:default", {
		accessToken: "tok-stale",
		refreshToken: "rt-1",
		scopes: ["read"],
		provider: "mock",
		expiresAt: Math.floor(Date.now() / 1000) - 60,
	});
	const auth = new AgentAuth({ providers: [provider], storage, log: false });

	const result = await auth.authorize("mock", { scopes: ["read"] });
	expect(authorizeCalls).toBe(1);
	expect(result.token.accessToken).toBe("tok-new");
});

// ---------------------------------------------------------------------------
// Scope satisfaction
// ---------------------------------------------------------------------------

test("requested scope not in cached token triggers fresh authorize", async () => {
	let authorizeCalls = 0;
	const provider = mockProvider({
		onAuthorize: async () => {
			authorizeCalls++;
			return {
				accessToken: "tok-broad",
				scopes: ["read", "write"],
				provider: "mock",
			};
		},
	});
	const storage = new MemoryTokenStorage();
	await storage.set("mock:default", {
		accessToken: "tok-narrow",
		scopes: ["read"], // missing "write"
		provider: "mock",
	});
	const auth = new AgentAuth({ providers: [provider], storage, log: false });

	const result = await auth.authorize("mock", { scopes: ["read", "write"] });
	expect(authorizeCalls).toBe(1);
	expect(result.token.accessToken).toBe("tok-broad");
});

// ---------------------------------------------------------------------------
// Multi-account
// ---------------------------------------------------------------------------

test("different `account` hints get separate cached tokens", async () => {
	const provider = mockProvider({
		onAuthorize: async () => ({
			accessToken: `tok-${Math.random()}`,
			scopes: [],
			provider: "mock",
		}),
	});
	const auth = new AgentAuth({
		providers: [provider],
		storage: new MemoryTokenStorage(),
		log: false,
	});

	const a = await auth.authorize("mock", { account: "alice" });
	const b = await auth.authorize("mock", { account: "bob" });
	expect(a.token.accessToken).not.toBe(b.token.accessToken);

	// Re-authorize alice — should hit cache.
	const a2 = await auth.authorize("mock", { account: "alice" });
	expect(a2.token.accessToken).toBe(a.token.accessToken);
	expect(a2.isNew).toBe(false);
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

test("authorize() with unregistered provider throws helpful error", async () => {
	const auth = new AgentAuth({ storage: new MemoryTokenStorage(), log: false });
	await expect(auth.authorize("nonexistent")).rejects.toThrow(
		/not registered/i,
	);
});

test("authorize() with flow that provider does not support throws", async () => {
	const provider = mockProvider({
		defaultFlow: "device",
		onAuthorize: async () => ({
			accessToken: "x",
			scopes: [],
			provider: "mock",
		}),
	});
	const auth = new AgentAuth({
		providers: [provider],
		storage: new MemoryTokenStorage(),
		log: false,
	});
	await expect(auth.authorize("mock", { flow: "loopback" })).rejects.toThrow(
		/loopback/i,
	);
});

// ---------------------------------------------------------------------------
// FileTokenStorage round-trip
// ---------------------------------------------------------------------------

let tmpDir: string;
beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "agentauth-"));
});

test("FileTokenStorage round-trips a token through disk", async () => {
	const path = join(tmpDir, "tokens.json");
	const store = new FileTokenStorage(path);

	expect(await store.get("k")).toBeNull();

	await store.set("k", {
		accessToken: "abc",
		scopes: ["read"],
		provider: "mock",
	});

	const got = await store.get("k");
	expect(got?.accessToken).toBe("abc");
	expect(got?.scopes).toEqual(["read"]);

	// Second instance reading same file
	const store2 = new FileTokenStorage(path);
	const got2 = await store2.get("k");
	expect(got2?.accessToken).toBe("abc");

	await store.delete("k");
	expect(await store.get("k")).toBeNull();

	rmSync(tmpDir, { recursive: true, force: true });
});
