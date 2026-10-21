import { MnemonAutoBackupScheduler } from './auto-backup.ts'
import type { MnemonAccounts } from './account-access.ts'
import type { MnemonGitHubAuth } from './github-auth.ts'
import type { LiveMnemonRuntime, MnemonRuntimeGraph } from './runtime.ts'

interface AccountSync {
  graph: MnemonRuntimeGraph
  auth: MnemonGitHubAuth
  scheduler: MnemonAutoBackupScheduler
  stop?: () => void
}

/** Account-owned credentials and timers survive settings reloads without sharing their runtime. */
export class MnemonAccountSync {
  private readonly entries = new Map<string, AccountSync>()
  private running = false

  constructor(runtime: LiveMnemonRuntime, private readonly accounts: MnemonAccounts, auth: (key: string) => MnemonGitHubAuth) {
    runtime.useAccountServices((principal, graph) => {
      const key = accounts.key(principal)
      let entry = this.entries.get(key)
      if (entry === undefined) {
        const holder = { graph }
        const scheduler = new MnemonAutoBackupScheduler({
          get config() { return holder.graph.config },
          get sync() { return holder.graph.sync },
        })
        entry = Object.assign(holder, { auth: auth(key), scheduler })
        this.entries.set(key, entry)
        if (this.running) entry.stop = scheduler.start()
      } else {
        entry.graph = graph
        entry.scheduler.refresh()
      }
      graph.sync.useGitHubAuth(entry.auth)
      const scheduler = entry.scheduler
      graph.sync.useAutoBackup(() => scheduler.snapshot())
    })
  }

  /** Start only instantiated account timers and stop them before disposing their graphs. */
  start(): () => void {
    this.running = true
    for (const entry of this.entries.values()) entry.stop = entry.scheduler.start()
    return () => {
      this.running = false
      for (const entry of this.entries.values()) entry.stop?.()
    }
  }

  /** Re-arm only the account that saved its backup settings. */
  refresh(): void { this.entries.get(this.accounts.key(this.accounts.require()))?.scheduler.refresh() }
}
