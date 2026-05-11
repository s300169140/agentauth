/** Small helpers shared by the core + providers. */

import { exec } from "node:child_process"
import { promisify } from "node:util"
import { randomBytes, createHash } from "node:crypto"

const execAsync = promisify(exec)

/** Cross-platform browser open. Returns false if we couldn't dispatch. */
export async function openBrowser(url: string): Promise<boolean> {
  const cmds: Record<NodeJS.Platform, string | null> = {
    aix: null,
    android: null,
    darwin: "open",
    freebsd: null,
    haiku: null,
    linux: "xdg-open",
    openbsd: null,
    sunos: null,
    win32: "start",
    cygwin: "start",
    netbsd: null,
  }
  const cmd = cmds[process.platform]
  if (!cmd) return false
  try {
    // Quote URL once. URLs in OAuth flows are guaranteed safe ASCII (no shell
    // metachars after URL-encoding), but defense in depth.
    const safeUrl = url.replace(/"/g, "%22")
    await execAsync(
      process.platform === "win32" ? `${cmd} "" "${safeUrl}"` : `${cmd} "${safeUrl}"`,
      { timeout: 5000 },
    )
    return true
  } catch {
    return false
  }
}

/** PKCE verifier + challenge per RFC 7636. */
export function pkceChallenge(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}

/** State token to bind authorize redirect to our local request. */
export function randomState(bytes = 16): string {
  return base64url(randomBytes(bytes))
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

/** Wait for a condition, polling. Throws on timeout. */
export async function waitFor<T>(
  fn: () => Promise<T | null>,
  opts: { timeoutMs: number; intervalMs: number; label: string },
): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs
  let attempt = 0
  while (Date.now() < deadline) {
    const result = await fn()
    if (result !== null) return result
    attempt++
    await sleep(opts.intervalMs)
  }
  throw new Error(`agentauth: ${opts.label} timed out after ${opts.timeoutMs}ms`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Tokens close to expiry should be treated as expired so we refresh proactively. */
const EXPIRY_BUFFER_SEC = 60

export function isExpired(expiresAt: number | undefined): boolean {
  if (expiresAt === undefined) return false
  return Date.now() / 1000 > expiresAt - EXPIRY_BUFFER_SEC
}
