/**
 * Token storage backends.
 *
 * Default: a file-backed JSON store at `~/.agentauth/tokens.json` with file-mode
 * 0600. We deliberately do NOT depend on `keytar` / native OS keychain bindings
 * — they require a node-gyp build step that breaks `npx`-style usage on minimal
 * environments (CI, containers, Bun, etc.). Users who want OS keychain backing
 * can implement `TokenStorage` themselves in 30 lines.
 */

import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import type { Token, TokenStorage } from "./types.js"

/** Returns the default tokens file path: `${AGENTAUTH_HOME ?? ~/.agentauth}/tokens.json`. */
export function defaultStoragePath(): string {
  const base = process.env.AGENTAUTH_HOME ?? join(homedir(), ".agentauth")
  return join(base, "tokens.json")
}

/**
 * JSON-on-disk token storage. Single file, mode 0600 on POSIX. Atomic writes
 * via rename so a concurrent reader never sees a half-written file.
 */
export class FileTokenStorage implements TokenStorage {
  constructor(private readonly path: string = defaultStoragePath()) {}

  private async readAll(): Promise<Record<string, Token>> {
    if (!existsSync(this.path)) return {}
    try {
      const raw = await readFile(this.path, "utf8")
      const parsed = JSON.parse(raw) as Record<string, Token>
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      // Corrupt / unreadable file — start fresh rather than throwing during
      // every authorize(). The user's next successful authorize() will
      // overwrite it cleanly.
      return {}
    }
  }

  private async writeAll(map: Record<string, Token>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.tmp-${process.pid}`
    await writeFile(tmp, JSON.stringify(map, null, 2), { mode: 0o600 })
    // Best-effort chmod in case the file already existed with looser perms.
    try {
      await chmod(tmp, 0o600)
    } catch {
      // ignore — Windows etc.
    }
    // Atomic on POSIX, "good enough" on Windows.
    const { rename } = await import("node:fs/promises")
    await rename(tmp, this.path)
  }

  async get(key: string): Promise<Token | null> {
    const all = await this.readAll()
    return all[key] ?? null
  }

  async set(key: string, token: Token): Promise<void> {
    const all = await this.readAll()
    all[key] = token
    await this.writeAll(all)
  }

  async delete(key: string): Promise<void> {
    const all = await this.readAll()
    if (!(key in all)) return
    delete all[key]
    if (Object.keys(all).length === 0) {
      // Tidy: remove the file when empty so users who uninstall don't leave
      // a dangling empty JSON.
      try {
        await rm(this.path)
      } catch {
        // ignore
      }
      return
    }
    await this.writeAll(all)
  }
}
