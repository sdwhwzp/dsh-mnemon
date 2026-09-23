import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { HostAgent, HostContextShape, HostPrincipal, HostPreStepDecision, HostRpcHandler, HostSettingsService, ToolExecution } from './dsh.ts'
import { hostSessionEvents } from './session-events.ts'
import { Config, InteractionConfig, resolveConfig, type ResolvedConfig } from './config.ts'

interface AccountContext { principal: HostPrincipal; sessions: ReadonlySet<string>; workspaces: ReadonlySet<string> }
interface AccessProvider {
  assertAuthenticated(principal: HostPrincipal): void
  modelAllowed(principal: HostPrincipal, provider: string, model: string): boolean
  resolve(principal: HostPrincipal, subjects: { sessionIds: string[]; workspaceIds: string[] }, signal?: AbortSignal): Promise<{ readableSessionIds: ReadonlySet<string>; readableWorkspaceIds: ReadonlySet<string> }>
}

/** Account storage and request ownership shared by UI, tools and lifecycle callbacks. */
export class MnemonAccounts {
  private readonly context = new AsyncLocalStorage<AccountContext>()
  private readonly agents = new WeakMap<HostAgent, AccountContext>()
  private readonly settings = new Map<string, { memory: { get(): Config }; ui: { get(): unknown } }>()
  private readonly proxies = new WeakMap<HostAgent, HostAgent>()
  private readonly originals = new WeakMap<HostAgent, HostAgent>()
  private readonly executions = new WeakMap<ToolExecution, ToolExecution>()
  private readonly base: Config

  constructor(private readonly ctx: HostContextShape, readonly directory: string, config: Config, private readonly accountSettings: HostSettingsService = ctx.settings) {
    // `sharedMemoryWritable` has exactly one source: the principal's role.
    // Dropping it here keeps a plugin-config value from granting every account
    // write access to the shared instance.
    const { sharedMemoryWritable: _ignored, accountPreferences: _preferences, ...rest } = config
    this.base = { ...rest, storageScope: 'custom', runtimeUserScope: 'storage', customPacks: [],
      persistenceStrategy: { mode: 'manual', providerId: 'mnemon-native', rules: { dataBoundary: 'local-only', allowedProviderIds: ['mnemon-native'] }, providerConnections: {} } }
  }

  key(principal: HostPrincipal): string {
    if (principal.source !== 'dsh-passwords' || !/^[1-9][0-9]*$/.test(principal.id)) throw new Error('Mnemon requires an authenticated account')
    return createHash('sha256').update(principal.source + ':' + principal.id).digest('hex')
  }

  current(): HostPrincipal | undefined { return this.context.getStore()?.principal }

  require(): HostPrincipal {
    const principal = this.current()
    if (principal === undefined) throw new Error('Mnemon account identity is required')
    this.key(principal)
    return principal
  }

  principal(agent: HostAgent): HostPrincipal | undefined {
    agent = this.originals.get(agent) ?? agent
    const bound = this.agents.get(agent)
    if (bound !== undefined) return bound.principal
    const events = hostSessionEvents(agent.session)
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index]!
      if (event.type === 'turn/start') return event.data.principal as HostPrincipal | undefined
    }
    return undefined
  }

  owns(agent: HostAgent): boolean {
    const actor = this.current()
    if (actor === undefined) return true
    const owner = this.principal(agent)
    return owner !== undefined && this.key(owner) === this.key(actor)
  }

  /** Counters and replay metadata use the same account as the operation that updates them. */
  state<T extends object>(initial: T): T {
    const values = new Map<string, T>()
    const current = (): T => {
      const principal = this.current()
      const key = principal === undefined ? '_host' : this.key(principal)
      let value = values.get(key)
      if (value === undefined) { value = structuredClone(initial); values.set(key, value) }
      return value
    }
    return new Proxy({} as T, {
      get: (_target, key) => Reflect.get(current(), key),
      set: (_target, key, value) => Reflect.set(current(), key, value),
      deleteProperty: (_target, key) => Reflect.deleteProperty(current(), key),
      ownKeys: () => Reflect.ownKeys(current()),
      getOwnPropertyDescriptor: (_target, key) => {
        const value = Reflect.getOwnPropertyDescriptor(current(), key)
        return value === undefined ? undefined : { ...value, configurable: true }
      },
    })
  }

  config(principal: HostPrincipal): ResolvedConfig {
    return resolveConfig(this.scopes(principal).memory.get())
  }

  private scopes(principal: HostPrincipal) {
    const key = this.key(principal)
    let scopes = this.settings.get(key)
    if (scopes !== undefined) return scopes
    // The shared instance is readable by every account and writable by an
    // admin only. Both facts come from the Host-verified principal, never from
    // a value the account itself could edit, so they are re-asserted on every
    // settings commit.
    const sharedWritable = principal.role === 'admin'
    const managed = {
      dataDir: join(this.directory, key),
      ...(this.base.sharedMemoryDir === undefined ? {} : { sharedMemoryDir: this.base.sharedMemoryDir }),
      ...(sharedWritable ? { sharedMemoryWritable: true } : {}),
    }
    const memory = this.accountSettings.register<Config>('mnemon-account-' + key, Config, {
      base: { ...this.base, ...managed }, applies: 'live',
      validate: value => {
        if (value.dataDir !== managed.dataDir || value.storageScope !== 'custom' || value.runtimeUserScope !== 'storage') throw new Error('Account memory storage is managed by the Host')
        if (value.sharedMemoryDir !== this.base.sharedMemoryDir) throw new Error('Shared memory storage is managed by the Host')
        if ((value.sharedMemoryWritable === true) !== sharedWritable) throw new Error('Shared memory write permission is managed by the Host')
        resolveConfig(value)
      },
    })
    const ui = this.accountSettings.register('mnemon-account-ui-' + key, InteractionConfig, { base: { turnBar: true, saveAction: true }, applies: 'live' })
    scopes = { memory, ui }
    this.settings.set(key, scopes)
    return scopes
  }

  /** Project only the authenticated account's persistent settings namespaces. */
  settingsService(changed: (principal: HostPrincipal) => void): HostSettingsService {
    const names = (principal: HostPrincipal) => new Map([
      ['mnemon', 'mnemon-account-' + this.key(principal)],
      ['mnemon-ui', 'mnemon-account-ui-' + this.key(principal)],
    ])
    return {
      writable: this.accountSettings.writable,
      register() { throw new Error('Account settings are registered by the Host') },
      describe: options => {
        const principal = this.require()
        this.scopes(principal)
        const mapped = names(principal)
        return this.accountSettings.describe(options).flatMap(value => {
          const ns = [...mapped].find(([, stored]) => stored === value.ns)?.[0]
          if (ns === undefined) return []
          const redact = (value: unknown) => {
            if (value === null || typeof value !== 'object') return value
            const config = value as Config
            return config.embedding === undefined ? value : { ...config, embedding: { ...config.embedding, apiKey: '' } }
          }
          return [{ ...value, ns, value: redact(value.value), base: redact(value.base), user: redact(value.user) }]
        })
      },
      mutate: async (namespace, ops, revision) => {
        const principal = this.require()
        this.scopes(principal)
        const ns = names(principal).get(namespace)
        if (ns === undefined) throw new Error('Unsupported account settings namespace')
        const fixed = ['accountPreferences', 'accountDataDir', 'storageScope', 'runtimeUserScope', 'dataDir', 'customPackId', 'customPacks', 'store', 'cliPath', 'embedding', 'persistenceStrategy', 'remoteAccess']
        for (const op of ops) {
          if (op.op !== 'set' || op.path[0] !== 'taskAgentModel') continue
          const model = resolveConfig({ taskAgentModel: op.value as NonNullable<Config['taskAgentModel']> }).taskAgentModel
          if (model.mode === 'fixed' && !(this.ctx.get('principalAccess') as AccessProvider).modelAllowed(principal, model.provider!, model.model!)) throw new Error('This model is unavailable to the account')
        }
        if (ops.some(op => fixed.includes(op.path[0] ?? ''))) throw new Error('Storage and provider connections are managed by the Host')
        await this.accountSettings.mutate(ns, ops, revision)
        changed(principal)
      },
    }
  }

  private async authorize(principal: HostPrincipal, payload: unknown, signal?: AbortSignal): Promise<AccountContext> {
    this.key(principal)
    const body = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {}
    const ids = (name: string): string[] => {
      const value = body[name]
      if (value === undefined || value === '') return []
      if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid Mnemon resource identifier')
      return [value]
    }
    const sessionIds = ids('sessionId'), workspaceIds = ids('workspaceId')
    const access = this.ctx.get('principalAccess') as AccessProvider | undefined
    if (access === undefined) throw new Error('Mnemon requires the deployment account authorization service')
    access.assertAuthenticated(principal)
    const allowed = await access.resolve(principal, { sessionIds, workspaceIds }, signal)
    if (sessionIds.some(id => !allowed.readableSessionIds.has(id)) || workspaceIds.some(id => !allowed.readableWorkspaceIds.has(id))) throw new Error('Mnemon resource belongs to another account or is unavailable')
    return { principal, sessions: allowed.readableSessionIds, workspaces: allowed.readableWorkspaceIds }
  }

  handler(handler: HostRpcHandler, channel: string): HostRpcHandler {
    return async (endpoint, payload, signal, supplied) => {
      try {
        const gateway = this.ctx.get('typertGateway') as { currentPrincipal(): HostPrincipal | undefined } | undefined
        const principal = supplied ?? gateway?.currentPrincipal()
        if (principal === undefined) throw new Error('Mnemon account identity is required')
        const account = await this.authorize(principal, payload, signal)
        if ((channel === 'view' || channel === '/dsh-mnemon-view') && endpoint !== 'dashboard') throw new Error('Plugin configuration is managed by the Host')
        if (channel === 'viewWrite' || channel === '/dsh-mnemon-view-settings' || endpoint === 'version-update') throw new Error('Plugin installation is managed by the Host')
        const body = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {}
        if (body.operation === 'provider-service-update') throw new Error('Account memory uses the Host-managed Native provider')
        const result = await this.context.run(account, () => handler(endpoint, payload, signal, principal))
        if (result.ok && endpoint === 'task-agent-models') {
          const catalog = result.value as import('./protocol.ts').TaskAgentModelCatalog
          const access = this.ctx.get('principalAccess') as AccessProvider
          const allowed = (route: { provider: string; model: string }) => access.modelAllowed(principal, route.provider, route.model)
          const { effective, defaultSelection, ...rest } = catalog
          return { ok: true, value: { ...rest,
            ...(effective === undefined || !allowed(effective) ? {} : { effective }),
            ...(defaultSelection === undefined || !allowed(defaultSelection) ? {} : { defaultSelection }),
            groups: catalog.groups.flatMap(group => {
              const models = group.models.filter(model => allowed({ provider: group.id, model: model.id }))
              return models.length === 0 ? [] : [{ ...group, models }]
            }),
          } }
        }
        if (result.ok && endpoint === 'versions') {
          const versions = result.value as import('./protocol.ts').VersionStatus
          return { ok: true, value: { ...versions, components: versions.components.map(component => ({ ...component, updateSupported: false, packages: component.packages?.map(pkg => ({ ...pkg, updateSupported: false })) })) } }
        }
        if (result.ok && (channel === 'view' || channel === '/dsh-mnemon-view')) {
          const dashboard = result.value as import('./view-protocol.ts').MemoryViewDashboard
          return { ok: true, value: { ...dashboard, writable: false,
            entries: dashboard.entries.map(entry => ({ ...entry, writable: false, config: {} })),
            pluginInstallation: { supported: false, reason: 'loader-unavailable', suggestions: [] },
          } }
        }
        return result
      } catch (error) {
        return { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} } }
      }
    }
  }

  async execute<T>(agent: HostAgent, operation: () => Promise<T>, signal?: AbortSignal, supplied?: HostPrincipal): Promise<T> {
    agent = this.originals.get(agent) ?? agent
    const principal = supplied ?? this.principal(agent) ?? this.current()
    if (principal === undefined) throw new Error('Mnemon Agent has no authenticated account')
    const owner = this.principal(agent)
    if (owner !== undefined && this.key(owner) !== this.key(principal)) throw new Error('Mnemon Agent account mismatch')
    let root = agent
    const visited = new Set<string>()
    while (root.session.header?.origin === 'subagent' && root.session.header.parentSession !== undefined) {
      if (visited.has(root.id)) throw new Error('Invalid Mnemon Agent lineage')
      visited.add(root.id)
      const parent = this.ctx.agents.get(root.session.header.parentSession)
      if (parent === undefined) throw new Error('Mnemon parent Agent is unavailable')
      const parentOwner = this.principal(parent)
      if (parentOwner !== undefined && this.key(parentOwner) !== this.key(principal)) throw new Error('Mnemon parent account mismatch')
      root = parent
    }
    const bound = this.agents.get(root)
    const account = bound === undefined
      ? await this.authorize(principal, { sessionId: root.id }, signal)
      : await this.authorize(principal, {
        ...bound.sessions.size === 0 ? {} : { sessionId: [...bound.sessions][0] },
        ...bound.workspaces.size === 0 ? {} : { workspaceId: [...bound.workspaces][0] },
      }, signal)
    return this.context.run(account, operation)
  }

  /** Keep deferred callbacks and worker creation attached to their initiating account. */
  wrapAgent(agent: HostAgent): HostAgent {
    const existing = this.proxies.get(agent)
    if (existing !== undefined) return existing
    const scopedContext = new Proxy(agent.ctx, { get: (target, property) => {
      if (property === 'on') return (name: string, listener: (...args: never[]) => unknown, options?: { prepend?: boolean }) => target.on(name, ((...args: never[]) => {
        const principal = this.principal(agent)
        if (principal === undefined) return listener(...args)
        const invoke = () => listener(...args.map(value => value !== null && typeof value === 'object' && (value as { agent?: HostAgent }).agent === agent
          ? { ...value as object, agent: proxy } : value) as never[])
        if (name === 'system-prompt/assemble' || name === 'agent/pre-step') return this.execute(agent, async () => {
          const result = await invoke()
          if (name !== 'agent/pre-step') return result
          const decision = result as HostPreStepDecision
          return decision.kind !== 'enter' ? decision : { ...decision, messages: decision.messages.map(message =>
            (message.source.kind === 'dsh-mnemon' || message.source.kind === 'plugin' && message.source.plugin === 'dsh-mnemon') ? { ...message, principal } : message) }
        })
        const current = this.context.getStore()
        const account = this.agents.get(agent) ?? (current !== undefined && this.key(current.principal) === this.key(principal) ? current : undefined)
          ?? { principal, sessions: new Set([agent.id]), workspaces: new Set<string>() }
        return this.context.run(account, invoke)
      }) as never, options)
      const value = Reflect.get(target, property, target) as unknown
      // Scope-keyed tool lookups (the Agent Teams pause check) must see the
      // Host's Agent object: the registry keys scope chains by identity.
      if (property === 'tools' && value !== null && typeof value === 'object' && typeof (value as { get?: unknown }).get === 'function') {
        const tools = value as NonNullable<HostAgent['ctx']['tools']>
        return new Proxy(tools, { get: (service, key) => {
          if (key === 'get') return (name: string, scope?: HostAgent) => tools.get!(name, scope === undefined ? undefined : this.originals.get(scope) ?? scope)
          const member = Reflect.get(service, key, service) as unknown
          return typeof member === 'function' ? member.bind(service) : member
        } })
      }
      return typeof value === 'function' ? value.bind(target) : value
    } })
    const proxy = new Proxy(agent, { get: (target, property) => {
      if (property === 'ctx') return scopedContext
      if (property === 'inject' || property === 'followup' || property === 'steer') return (message: Parameters<HostAgent['inject']>[0]) => {
        const principal = this.principal(agent) ?? this.require()
        target[property]({ ...message, principal })
      }
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    } })
    this.originals.set(proxy, agent)
    this.proxies.set(agent, proxy)
    this.proxies.set(proxy, proxy)
    return proxy
  }

  /** One account-facing identity per dispatch; methods retain the Host receiver. */
  private wrapExecution(execution: ToolExecution): ToolExecution {
    const existing = this.executions.get(execution)
    if (existing !== undefined) return existing
    // A separate target permits the agent view after the Host freezes its execution.
    const wrapped = new Proxy({} as ToolExecution, {
      get: (_target, property) => {
        if (property === 'agent') return execution.agent === undefined ? undefined : this.wrapAgent(execution.agent)
        const value = Reflect.get(execution, property, execution) as unknown
        return typeof value === 'function' ? value.bind(execution) : value
      },
      ownKeys: () => Reflect.ownKeys(execution),
      getOwnPropertyDescriptor: (_target, property) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(execution, property)
        return descriptor === undefined ? undefined : { ...descriptor, configurable: true }
      },
    })
    this.executions.set(execution, wrapped)
    return wrapped
  }

  wrapContext(): HostContextShape {
    const agents = this.ctx.agents
    const scopedAgents = {
      get: (id: string) => { const agent = agents.get(id); return agent === undefined || !this.owns(agent) ? undefined : this.wrapAgent(agent) },
      roots: () => agents.roots().filter(agent => this.owns(agent)).map(agent => this.wrapAgent(agent)),
      // Runtime ownership must survive scoping: the background memory review
      // asks the registry whether the child it just started belongs to the
      // parent it holds, and under account mode that parent is a proxy the
      // registry has never seen. Unwrap it the way the subagents facade does.
      // Dropping this member made every account-mode review fail closed with
      // "Mnemon review requires DSH Agent ownership and scoped tool guard
      // support", because the reviewer reads the member, not the service.
      ...(agents.isOwnedBy === undefined ? {} : {
        isOwnedBy: (id: string, parent: HostAgent) => agents.isOwnedBy!(id, this.originals.get(parent) ?? parent),
      }),
      ...(agents.create === undefined ? {} : { create: async (options: Parameters<NonNullable<typeof agents.create>>[0]) => {
        const account = this.context.getStore()
        if (account === undefined) throw new Error('Mnemon task creation requires an account')
        const handle = await agents.create!(options)
        this.agents.set(handle.agent, account)
        const wrapped = this.wrapAgent(handle.agent)
        this.agents.set(wrapped, account)
        return { ...handle, agent: wrapped }
      } }),
    }
    return new Proxy(this.ctx, { get: (target, property) => {
      if (property === 'agents') return scopedAgents
      if (property === 'tools') return { register: (definition: Parameters<typeof target.tools.register>[0]) => target.tools.register({ ...definition,
        execute: (args: never, execution) => {
          if (execution.agent === undefined) throw new Error('Mnemon requires an Agent')
          return this.execute(execution.agent, () => definition.execute(args, this.wrapExecution(execution)), execution.signal, execution.principal)
        },
      }) }
      if (property === 'commands') return { register: (definition: Parameters<typeof target.commands.register>[0]) => target.commands.register({ ...definition,
        handler: invocation => this.execute(invocation.agent, async () => definition.handler({ ...invocation, agent: this.wrapAgent(invocation.agent) }), invocation.signal),
      }) }
      if (property === 'subagents') return new Proxy(target.subagents, { get: (service, key) => {
        if (key === 'start') return (provider: string, request: Parameters<typeof service.start>[1]) => service.start(provider, { ...request, parent: this.originals.get(request.parent) ?? request.parent, principal: this.principal(request.parent) ?? this.require() })
        const value = Reflect.get(service, key, service) as unknown
        return typeof value === 'function' ? value.bind(service) : value
      } })
      if (property === 'on') return (name: string, listener: (...args: never[]) => unknown, options?: { prepend?: boolean }) => target.on(name,
        name === 'agent/created' ? ((payload: { agent: HostAgent }) => this.context.exit(() => listener({ ...payload, agent: this.wrapAgent(payload.agent) } as never))) as never
          : name === 'tools/result' ? ((execution: ToolExecution, result: unknown) => listener(this.wrapExecution(execution) as never, result as never)) as never
          : listener, options)
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    } })
  }
}
