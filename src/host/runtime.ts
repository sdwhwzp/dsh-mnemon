import { isDefaultSourceInstance, isWorkspaceStorageScope, isSharedMemoryInstance, type MnemonSyncAutoBackup } from './protocol.ts'
import { join, resolve } from 'node:path'
import type { ResolvedConfig } from './config.ts'
import type { HostAgent, HostAgentsService, HostSessionPersistence, HostWorkspace, HostWorkspaceRegistry } from './dsh.ts'
import { MnemonPackManager } from './pack.ts'
import { MnemonReviewLedger } from './review-ledger.ts'
import { MnemonGitSync } from './git-sync.ts'
import type { MnemonGitHubAuth } from './github-auth.ts'
import { StorageScopeInspector } from './storage-scope.ts'
import { createStorageRoot } from './storage-root.ts'
import { canonicalWorkspacePath } from '../sdk/workspace-storage.ts'
import { SourceSession } from './source-session.ts'
import { MemoryRuntime } from '../core/runtime.ts'
import type { MemoryGenerationHost } from '../core/generation.ts'
import { ComposableMemoryTurnManager } from '../core/turns.ts'
import { MEMORY_CAPABILITIES, type MemoryOperationScope } from '../core/contracts/index.ts'
import { allowsParticipation } from './access.ts'
import { mainStrategyTypeId } from './main-strategy.ts'
import type { CompileMemoryGenerationOptions } from '../core/composition.ts'
import { MemoryExecutions } from './memory-executions.ts'
import type { MnemonAccounts } from './account-access.ts'
import type { HostPrincipal } from './dsh.ts'

export interface MnemonRuntimeGraph {
  readonly config: ResolvedConfig
  readonly directory: string
  readonly storage: StorageScopeInspector
  readonly packs: MnemonPackManager
  readonly sync: MnemonGitSync
  /** Review proposals for merged memory. Never synced, never Packed. */
  readonly reviews: MnemonReviewLedger
  readonly memoryComposition: MemoryGenerationHost
  readonly composableTurns: ComposableMemoryTurnManager
  source(typeId: string, scope?: MemoryOperationScope): SourceSession
  retire(): void
  dispose(): void
}

export interface MnemonAgentRuntimeSource {
  readonly config: ResolvedConfig
  readonly executions: MemoryExecutions
  forAgent(agent: HostAgent): MnemonRuntimeGraph
  bindAgentRuntime(agentId: string, graph: MnemonRuntimeGraph): () => void
}

export function agentScope(agent: HostAgent, config: ResolvedConfig): MemoryOperationScope {
  const workspaceId = agent.session.header?.cwd?.trim()
  return { storage: config.storageScope, ...(workspaceId ? { workspaceId: resolve(workspaceId) } : {}), sessionId: agent.id, agentId: agent.id }
}

/** Shared by production graphs and read-only View previews. */
export function memoryGenerationOptions(config: ResolvedConfig, workspaceRoot: string | undefined): CompileMemoryGenerationOptions {
  const directory = createStorageRoot(config, workspaceRoot).effectiveDataDir()
  const userDirectory = config.runtimeUserScope === 'global' ? createStorageRoot({ storageScope: 'global' }).effectiveDataDir() : directory
  return {
    strategyTypeId: mainStrategyTypeId(config),
    // A main Strategy switched off in the DSH Plugins page must not leave the
    // Host without a View while exactly one other Strategy remains.
    strategyFallback: 'sole-strategy',
    sourceTimeoutMs: config.timeoutMs,
    sourceCapabilities: installed => MEMORY_CAPABILITIES.filter(capability =>
      (config.writeEnabled || !['write', 'archive', 'link', 'forget', 'maintain', 'import'].includes(capability))
      && allowsParticipation(config, installed.definition.manifest.typeId, capability, 'automatic')),
    sourceConfiguration: installed => {
      const type = installed.definition.manifest.typeId
      // The shared instance is the one non-default Source account mode admits,
      // and the Host assigns its directory and write permission here so the
      // entry in cordis.patch.yml cannot aim it at an account's own directory.
      if (isSharedMemoryInstance(installed.instanceKey)) {
        if (type !== 'memory-spaces') throw new Error('The shared memory instance must be a memory-spaces Source')
        if (config.sharedMemoryDir === undefined) throw new Error('The shared memory instance requires sharedMemoryDir')
        return JSON.parse(JSON.stringify({
          dataDir: config.sharedMemoryDir, cliPath: config.cliPath, store: config.store, timeoutMs: config.timeoutMs,
          defaultRecallLimit: config.defaultRecallLimit,
          // Read-only for everyone but an admin account: a recall layer every
          // account shares must not be writable by every account.
          writeEnabled: config.writeEnabled && config.sharedMemoryWritable === true,
          embedding: config.embedding, recallQuality: config.recallQuality, persistenceStrategy: config.persistenceStrategy,
        }))
      }
      if (config.accountDataDir !== undefined && (!['runtime', 'documents', 'memory-spaces', 'skills'].includes(type) || !isDefaultSourceInstance(installed.instanceKey, type))) {
        // Name the instance: the refusal is otherwise indistinguishable from a
        // Host that shipped without the shared-instance branch at all.
        throw new Error(`Account memory supports only the bundled default Sources (refused ${installed.instanceKey}, type ${type})`)
      }
      if (!isDefaultSourceInstance(installed.instanceKey, type)) return {}
      const account = config.accountDataDir === undefined ? {} : { accountIsolated: true }
      if (type === 'runtime') return { ...account, dataDir: directory, userDataDir: userDirectory, memoryLimitBytes: config.runtimeMemory.memoryLimitBytes, userLimitBytes: config.runtimeMemory.userLimitBytes }
      if (type === 'documents') return { ...account, dataDir: directory }
      if (type === 'skills') return { ...account, dataDir: directory, ...(config.accountDataDir === undefined ? {} : { dshHome: join(directory, 'dsh-home'), agentsHome: join(directory, 'agents-home') }) }
      if (type === 'memory-spaces') return JSON.parse(JSON.stringify({
        ...account, dataDir: directory, cliPath: config.cliPath, store: config.store, timeoutMs: config.timeoutMs,
        defaultRecallLimit: config.defaultRecallLimit, writeEnabled: config.writeEnabled,
        embedding: config.embedding, recallQuality: config.recallQuality, persistenceStrategy: config.persistenceStrategy,
      }))
      return {}
    },
  }
}

/** One default-product scope over the single Composable Runtime. */
export function createRuntimeGraph(config: ResolvedConfig, workspaceRoot: string | undefined, extensions: MemoryRuntime): MnemonRuntimeGraph {
  const root = createStorageRoot(config, workspaceRoot)
  const directory = root.effectiveDataDir()
  const attachment = extensions.attachGeneration(memoryGenerationOptions(config, workspaceRoot))
  const evaluation = attachment.host.inspect().evaluation
  if (evaluation.state === 'rejected') {
    void attachment.dispose()
    throw new Error(evaluation.diagnostics.map(value => value.message).join('; '))
  }
  const composableTurns = new ComposableMemoryTurnManager(attachment.host)
  const packs = new MnemonPackManager(root, config, () => {}, () => new Date())
  let disposed = false
  return {
    config, directory, storage: new StorageScopeInspector(root, config), packs, sync: new MnemonGitSync(root, config, packs),
    reviews: new MnemonReviewLedger(root),
    memoryComposition: attachment.host, composableTurns,
    source: (type, scope = { storage: config.storageScope, ...(workspaceRoot === undefined ? {} : { workspaceId: workspaceRoot }) }) => new SourceSession(attachment.host, composableTurns, type, scope),
    retire: () => attachment.release(),
    dispose: () => {
      if (disposed) return
      disposed = true
      composableTurns.dispose()
      void attachment.dispose()
    },
  }
}

/**
 * When the Host asks a data directory's Providers again for namespaces they gained (#373): a
 * little after a runtime starts serving it, then, while a try cannot reach the Source, after
 * `retryDelayMs`, `attempts` tries in all. Tests shorten these.
 */
export const PROVIDER_REDISCOVERY_TIMING = { delayMs: 10_000, retryDelayMs: 30_000, attempts: 3 }

/** Data directories whose Provider namespaces this process has asked for again, or is asking now. */
const rediscoveredDirectories = new Set<string>()

/** An answer asking again cannot change: no Memory Spaces Source, or one older than this request. */
function finalRediscoveryAnswer(error: unknown): boolean {
  return /unsupported Memory Spaces management mutation operation|is not installed/u.test(error instanceof Error ? error.message : String(error))
}

/** Resolve every property access against one generation, binding methods to it. */
function liveProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_placeholder, property) {
      const target = resolve()
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
    has(_placeholder, property) {
      return property in resolve()
    },
    ownKeys() {
      return Reflect.ownKeys(resolve())
    },
    getOwnPropertyDescriptor(_placeholder, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), property)
      return descriptor === undefined ? undefined : { ...descriptor, configurable: true }
    },
  })
}

/**
 * Stable faces handed to DSH registrations. `swap` is synchronous and contains
 * no user code, so all faces move to the same prevalidated generation in one
 * JavaScript turn. A method obtained before the swap stays bound to its old
 * generation until that invocation settles.
 */
export class LiveMnemonRuntime implements MnemonAgentRuntimeSource {
  readonly executions = new MemoryExecutions(this)
  private current: MnemonRuntimeGraph
  private readonly workspaceGraphs = new Map<string, MnemonRuntimeGraph>()
  private readonly accountGraphs = new Map<string, MnemonRuntimeGraph>()
  private readonly agentGraphs = new Map<string, { token: symbol; graph: MnemonRuntimeGraph }>()
  private readonly retiredGraphs = new Set<MnemonRuntimeGraph>()
  /** The start-up rediscovery each graph has waiting or running, to stop when the graph goes. */
  private readonly rediscoveries = new Map<MnemonRuntimeGraph, () => void>()
  private githubAuth: MnemonGitHubAuth | undefined
  private autoBackupView: (() => MnemonSyncAutoBackup | undefined) | undefined
  private accountServices: ((principal: HostPrincipal, graph: MnemonRuntimeGraph) => void) | undefined
  private closed = false

  readonly config: ResolvedConfig
  readonly storage: StorageScopeInspector
  readonly packs: MnemonPackManager
  readonly sync: MnemonGitSync
  readonly reviews: MnemonReviewLedger

  constructor(initial: MnemonRuntimeGraph, private readonly workspaceRegistry: HostWorkspaceRegistry | undefined, private readonly agents: Pick<HostAgentsService, 'get'> | undefined, private readonly extensions: MemoryRuntime, private readonly accounts?: MnemonAccounts, private readonly persistence?: HostSessionPersistence) {
    this.current = initial
    this.config = liveProxy(() => this.active().config)
    this.storage = liveProxy(() => this.active().storage)
    this.packs = liveProxy(() => this.active().packs)
    this.sync = liveProxy(() => this.active().sync)
    this.reviews = liveProxy(() => this.active().reviews)
    this.rediscoverProviders(initial)
  }

  private active(): MnemonRuntimeGraph {
    const principal = this.accounts?.current()
    return principal === undefined ? this.current : this.forAccount(principal)
  }

  private forAccount(principal: HostPrincipal): MnemonRuntimeGraph {
    this.assertOpen()
    const key = this.accounts!.key(principal)
    let graph = this.accountGraphs.get(key)
    if (graph === undefined) {
      graph = createRuntimeGraph(this.accounts!.config(principal), undefined, this.extensions)
      this.accountGraphs.set(key, graph)
      this.accountServices?.(principal, graph)
      this.rediscoverProviders(graph)
    }
    return graph
  }

  /** Retain active turn pins while later operations see the account's saved preferences. */
  reloadAccount(principal: HostPrincipal): void {
    const key = this.accounts!.key(principal)
    const graph = createRuntimeGraph(this.accounts!.config(principal), undefined, this.extensions)
    const old = this.accountGraphs.get(key)
    this.accountGraphs.set(key, graph)
    this.accountServices?.(principal, graph)
    this.rediscoverProviders(graph)
    if (old !== undefined) this.retireGraph(old)
  }

  /** Attach account-owned services whenever an authenticated runtime is created or reloaded. */
  useAccountServices(attach: (principal: HostPrincipal, graph: MnemonRuntimeGraph) => void): void {
    this.accountServices = attach
  }

  /**
   * Share one GitHub sign-in with every generation this runtime builds. The
   * settings page and an Agent's workspace graph then resolve the same grant,
   * and a later generation cannot silently lose the login.
   */
  useGitHubAuth(auth: MnemonGitHubAuth | undefined): void {
    this.githubAuth = auth
    this.applyGitHubAuth(this.current)
  }

  private applyGitHubAuth(graph: MnemonRuntimeGraph): void {
    if (this.githubAuth !== undefined) graph.sync.useGitHubAuth(this.githubAuth)
  }

  /**
   * Let the settings page read the background cadence without owning the timer.
   * The timer belongs to the plugin root, one instance for the whole Host, so
   * it is shared with every generation the same way the GitHub grant is.
   */
  useAutoBackup(view: (() => MnemonSyncAutoBackup | undefined) | undefined): void {
    this.autoBackupView = view
    if (view !== undefined) this.current.sync.useAutoBackup(view)
  }

  private applyAutoBackup(graph: MnemonRuntimeGraph): void {
    if (this.autoBackupView !== undefined) graph.sync.useAutoBackup(this.autoBackupView)
  }

  swap(next: MnemonRuntimeGraph): void {
    if (this.closed) {
      next.dispose()
      throw new Error('Mnemon runtime is disposed')
    }
    const previous = this.current
    this.current = next
    this.applyGitHubAuth(next)
    this.applyAutoBackup(next)
    this.rediscoverProviders(next)
    this.retireGraph(previous)
    for (const graph of this.workspaceGraphs.values()) this.retireGraph(graph)
    this.workspaceGraphs.clear()
  }

  snapshot(): MnemonRuntimeGraph {
    this.assertOpen()
    if (this.accounts !== undefined) return this.forAccount(this.accounts.require())
    return this.active()
  }

  bindAgentRuntime(agentId: string, graph: MnemonRuntimeGraph): () => void {
    this.assertOpen()
    const id = agentId.trim()
    if (id === '') throw new Error('Mnemon runtime binding requires an Agent id')
    if (this.agentGraphs.has(id)) throw new Error(`Mnemon runtime is already pinned for Agent ${id}`)
    const token = Symbol(id)
    this.agentGraphs.set(id, { token, graph })
    return () => {
      if (this.agentGraphs.get(id)?.token !== token) return
      this.agentGraphs.delete(id)
      this.collectRetired(graph)
    }
  }

  dispose(): void {
    if (this.closed) return
    this.executions.dispose()
    this.closed = true
    const graphs = new Set<MnemonRuntimeGraph>([
      this.current,
      ...this.workspaceGraphs.values(),
      ...this.accountGraphs.values(),
      ...[...this.agentGraphs.values()].map(binding => binding.graph),
      ...this.retiredGraphs,
    ])
    this.agentGraphs.clear()
    this.workspaceGraphs.clear()
    this.accountGraphs.clear()
    this.retiredGraphs.clear()
    for (const stop of this.rediscoveries.values()) stop()
    this.rediscoveries.clear()
    for (const graph of graphs) graph.dispose()
  }

  /** Resolve the runtime that must serve one Agent execution. */
  forAgent(agent: HostAgent): MnemonRuntimeGraph {
    this.assertOpen()
    const principal = this.accounts?.principal(agent) ?? this.accounts?.current()
    if (this.accounts !== undefined && principal === undefined) throw new Error('Mnemon Agent has no account identity')
    const owned = principal === undefined ? undefined : this.forAccount(principal)
    const pinned = this.agentGraphs.get(agent.id)
    if (pinned !== undefined) {
      if (owned !== undefined && pinned.graph.directory !== owned.directory) throw new Error('Mnemon turn belongs to another account')
      return pinned.graph
    }
    const parentSession = agent.session.header?.origin === 'subagent' ? agent.session.header.parentSession?.trim() : undefined
    const inherited = parentSession === undefined || parentSession === '' ? undefined : this.agentGraphs.get(parentSession)
    if (inherited !== undefined) {
      if (owned !== undefined && inherited.graph.directory !== owned.directory) throw new Error('Mnemon parent belongs to another account')
      return inherited.graph
    }
    if (owned !== undefined) return owned
    if (!isWorkspaceStorageScope(this.current.config.storageScope)) return this.current
    const cwd = agent.session.header?.cwd?.trim()
    if (cwd === undefined || cwd === '') throw new Error('the current DSH session has no workspace for Mnemon')
    return this.forWorkspacePath(cwd)
  }

  /** Resolve an authorized DSH workspace selected by the Web workbench. */
  forWorkspaceId(workspaceId: string): MnemonRuntimeGraph {
    this.assertOpen()
    const workspace = this.requireWorkspace(workspaceId)
    if (this.accounts !== undefined) return this.forAccount(this.accounts.require())
    return isWorkspaceStorageScope(this.current.config.storageScope) ? this.forWorkspacePath(workspace.path) : this.current
  }

  /** Resolve authorized management requests from live or persisted headers, preferring the explicit inspection workspace. */
  async route(request: { workspaceId?: string; sessionId?: string }, signal?: AbortSignal): Promise<{
    graph: MnemonRuntimeGraph
    sessionWorkspaceRoot?: string
    selectedWorkspace?: HostWorkspace
    effectiveWorkspace?: HostWorkspace
    selectedRoot: string
    effectiveRoot: string
    aligned: boolean
    /** The request names a session whose Agent is loaded. */
    liveSession: boolean
  }> {
    this.assertOpen()
    const effectiveAgent = this.agent(request.sessionId)
    const stored = effectiveAgent === undefined && request.sessionId !== undefined
      ? await this.persistence?.stat(request.sessionId, signal === undefined ? undefined : { signal })
      : undefined
    signal?.throwIfAborted()
    this.assertOpen()
    const current = this.accounts === undefined ? this.current : this.forAccount(this.accounts.require())
    const sessionWorkspaceRoot = effectiveAgent?.session.header?.cwd ?? stored?.header.cwd
      ?? this.workspaceForSession(request.sessionId)?.path
    const effectiveWorkspace = this.workspaceForPath(sessionWorkspaceRoot)
    const selectedWorkspace = request.workspaceId === undefined || request.workspaceId.trim() === ''
      ? effectiveWorkspace
      : this.requireWorkspace(request.workspaceId)
    const effectiveGraph = effectiveAgent !== undefined ? this.forAgent(effectiveAgent)
      : sessionWorkspaceRoot !== undefined && isWorkspaceStorageScope(current.config.storageScope) ? this.forWorkspacePath(sessionWorkspaceRoot) : current
    const graph = selectedWorkspace === undefined
      ? effectiveGraph
      : isWorkspaceStorageScope(current.config.storageScope) ? this.forWorkspacePath(selectedWorkspace.path) : current
    const selectedRoot = resolve(graph.directory)
    const effectiveRoot = resolve(effectiveGraph.directory)
    return {
      graph,
      ...(sessionWorkspaceRoot === undefined ? {} : { sessionWorkspaceRoot }),
      ...(selectedWorkspace === undefined ? {} : { selectedWorkspace }),
      ...(effectiveWorkspace === undefined ? {} : { effectiveWorkspace }),
      selectedRoot,
      effectiveRoot,
      aligned: selectedRoot === effectiveRoot,
      liveSession: effectiveAgent !== undefined,
    }
  }

  private forWorkspacePath(workspaceRoot: string): MnemonRuntimeGraph {
    const key = this.current.config.storageScope === 'workspaces' ? canonicalWorkspacePath(resolve(workspaceRoot)) : resolve(workspaceRoot)
    let graph = this.workspaceGraphs.get(key)
    if (graph === undefined) {
      graph = createRuntimeGraph(this.current.config, key, this.extensions)
      this.applyGitHubAuth(graph)
      this.applyAutoBackup(graph)
      this.rediscoverProviders(graph)
      this.workspaceGraphs.set(key, graph)
    }
    return graph
  }

  /**
   * Ask the Providers of one data directory again for namespaces they gained, once per process,
   * a little after a runtime this Host serves starts (#373); a graph built only to validate
   * settings never asks. A read-only runtime asks nothing, and neither does one whose Memory
   * Spaces layer is off or does not maintain itself automatically. A try that cannot reach the
   * Source, before a generation serves for example, is made again a little later; one cut short
   * because its runtime was replaced is left to the runtime that replaced it.
   */
  private rediscoverProviders(graph: MnemonRuntimeGraph): void {
    if (!graph.config.writeEnabled || !allowsParticipation(graph.config, 'memory-spaces', 'maintain', 'automatic')) return
    const directory = resolve(graph.directory)
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = false
    const release = () => { if (this.rediscoveries.get(graph) === stop) this.rediscoveries.delete(graph) }
    const schedule = (attempt: number, delayMs: number) => {
      timer = setTimeout(() => void ask(attempt), delayMs)
      timer.unref?.()
    }
    const ask = async (attempt: number) => {
      timer = undefined
      if (rediscoveredDirectories.has(directory)) return release()
      rediscoveredDirectories.add(directory)
      running = true
      let again = false
      try {
        await graph.source('memory-spaces').mutate('provider-rediscover', { trigger: 'startup' }, controller.signal)
      } catch (error) {
        again = !finalRediscoveryAnswer(error)
      } finally {
        running = false
      }
      if (controller.signal.aborted) return
      if (again) {
        rediscoveredDirectories.delete(directory)
        if (attempt < PROVIDER_REDISCOVERY_TIMING.attempts) return schedule(attempt + 1, PROVIDER_REDISCOVERY_TIMING.retryDelayMs)
      }
      release()
    }
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer)
      // A pass cut short is left to the next runtime for this directory, however the Source ends it.
      if (running) rediscoveredDirectories.delete(directory)
      controller.abort(new Error('the Mnemon runtime was replaced'))
    }
    this.rediscoveries.get(graph)?.()
    this.rediscoveries.set(graph, stop)
    schedule(1, PROVIDER_REDISCOVERY_TIMING.delayMs)
  }

  private retireGraph(graph: MnemonRuntimeGraph): void {
    this.rediscoveries.get(graph)?.()
    this.rediscoveries.delete(graph)
    graph.retire()
    if ([...this.agentGraphs.values()].some(binding => binding.graph === graph)) this.retiredGraphs.add(graph)
    else graph.dispose()
  }

  private collectRetired(graph: MnemonRuntimeGraph): void {
    if (!this.retiredGraphs.has(graph)) return
    if ([...this.agentGraphs.values()].some(binding => binding.graph === graph)) return
    this.retiredGraphs.delete(graph)
    graph.dispose()
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Mnemon runtime is disposed')
  }

  private agent(sessionId?: string): HostAgent | undefined {
    const normalized = sessionId?.trim()
    return normalized === undefined || normalized === '' ? undefined : this.agents?.get(normalized)
  }

  private requireWorkspace(workspaceId: string): HostWorkspace {
    const normalized = workspaceId.trim()
    const workspace = normalized === '' ? undefined : this.workspaceRegistry?.get(normalized)
    if (workspace === undefined) throw new Error('selected DSH workspace is unavailable')
    return workspace
  }

  private workspaceForSession(sessionId?: string): HostWorkspace | undefined {
    const normalized = sessionId?.trim()
    if (normalized === undefined || normalized === '') return undefined
    return this.workspaceRegistry?.list().find(workspace => workspace.sessionIds?.includes(normalized) === true)
  }

  private workspaceForPath(path?: string): HostWorkspace | undefined {
    const normalized = path?.trim()
    if (normalized === undefined || normalized === '') return undefined
    const canonical = resolve(normalized)
    return this.workspaceRegistry?.list().find(workspace => resolve(workspace.path) === canonical)
  }
}
