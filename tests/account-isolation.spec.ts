import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memorySettings } from './helpers/account-settings.ts'
import { MnemonAccounts } from '../src/host/account-access.ts'
import type { HostAgent, HostContextShape, HostPrincipal, HostRpcHandler, ToolDefinition } from '../src/host/dsh.ts'
import { createReadHandler, createWriteHandler } from '../src/host/rpc.ts'
import { LiveMnemonRuntime } from '../src/host/runtime.ts'
import { createSettingsHandler } from '../src/host/settings.ts'
import { compositionFixture } from './fixtures/composition.ts'

const alice: HostPrincipal = { source: 'dsh-passwords', id: '1', username: 'same-name', role: 'user' }
const bob: HostPrincipal = { ...alice, id: '2' }
const cleanups: Array<() => unknown> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })


function agent(id: string, principal: HostPrincipal, cwd: string): HostAgent {
  return { id, status: 'idle', session: { header: { cwd }, events: [{ type: 'turn/start', data: { turn: 1, principal } }] },
    ctx: { on: vi.fn(), effect: vi.fn() }, followup: vi.fn(), steer: vi.fn(), inject: vi.fn() }
}

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mnemon-accounts-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const composition = await compositionFixture({ dataDir: join(root, 'control') }, { nativeOnly: true, sourceDataDir: join(root, 'shared-source-override') })
  cleanups.push(composition.dispose)
  const sessions = [agent('alice-session', alice, composition.workspace), agent('bob-session', bob, composition.workspace)]
  const workspaces = [{ id: 'shared', title: 'Shared project', path: composition.workspace }, { id: 'bob-only', title: 'Private', path: root }]
  const active = new Set(['1', '2'])
  const tools: ToolDefinition[] = []
  const ctx = {
    settings: memorySettings(),
    agents: { get: (id: string) => sessions.find(value => value.id === id), roots: () => sessions,
      create: vi.fn(async ({ sessionId }: { sessionId: string }) => {
        const value = agent(sessionId, alice, composition.workspace)
        value.session.events = []
        sessions.push(value)
        return { agent: value, dispose: vi.fn(async () => {}) }
      }),
    },
    tools: { register: (tool: ToolDefinition) => tools.push(tool) },
    subagents: { start: vi.fn(async () => ({})), list: () => [] },
    commands: { register: vi.fn() },
    get: (name: string) => name === 'principalAccess' ? { assertAuthenticated: (principal: HostPrincipal) => { if (!active.has(principal.id)) throw new Error('account disabled') }, modelAllowed: (_principal: HostPrincipal, provider: string, model: string) => provider !== 'codex' || model !== 'gpt-5.5', resolve: async (principal: HostPrincipal, input: { sessionIds: string[]; workspaceIds: string[] }) => ({
      readableSessionIds: new Set(input.sessionIds.filter(id => id === (principal.id === '1' ? 'alice-session' : 'bob-session'))),
      readableWorkspaceIds: new Set(input.workspaceIds.filter(id => id === 'shared' || principal.id === '2' && id === 'bob-only')),
    }) } : undefined,
  } as unknown as HostContextShape
  const accounts = new MnemonAccounts(ctx, join(root, 'accounts'), { accountDataDir: join(root, 'accounts'), cliPath: process.env.MNEMON_NATIVE_TEST_CLI ?? '/fake/mnemon' })
  const scoped = accounts.wrapContext()
  const stored = new Map(sessions.map(session => [session.id, { header: { cwd: session.session.header!.cwd! } }]))
  const stat = vi.fn(async (id: string) => stored.get(id))
  const live = new LiveMnemonRuntime(composition.graph, { get: id => workspaces.find(value => value.id === id), list: () => workspaces }, scoped.agents, composition.extensions, accounts, { stat })
  cleanups.push(() => live.dispose())
  const read = accounts.handler(createReadHandler(live), 'read')
  const write = accounts.handler(createWriteHandler(live), 'write')
  const settings = accounts.handler(createSettingsHandler(accounts.settingsService(p => live.reloadAccount(p))), 'settings')
  return { root, accounts, live, ctx, scoped, sessions, tools, read, write, settings, active, stat }
}

describe('authenticated Mnemon account memory', () => {
  it('authorizes cold-session metadata before reading it and retains account document isolation', async () => {
    const f = await fixture()
    f.sessions.splice(0)
    expect(await f.read('documents', { sessionId: 'bob-session' }, undefined, alice)).toMatchObject({ ok: false })
    expect(f.stat).not.toHaveBeenCalled()
    expect(await f.write('document', { sessionId: 'alice-session', action: 'create', title: 'Alice cold document', content: 'Private saved notes' }, undefined, alice)).toMatchObject({ ok: true })
    expect(await f.read('documents', { sessionId: 'alice-session' }, undefined, alice)).toMatchObject({ ok: true, value: { activeCount: 1 } })
    expect(await f.read('documents', { sessionId: 'bob-session' }, undefined, bob)).toMatchObject({ ok: true, value: { activeCount: 0 } })
    expect(f.ctx.agents.create).not.toHaveBeenCalled()
  })

  it('separates real Runtime and Documents data even when accounts share a project and username', async () => {
    const f = await fixture()
    for (const [principal, label] of [[alice, 'Alice'], [bob, 'Bob']] as const) {
      expect(await f.write('runtime-memory', { action: 'add', target: 'memory', content: label }, undefined, principal)).toMatchObject({ ok: true })
      expect(await f.write('document', { workspaceId: 'shared', action: 'create', title: label, content: '# ' + label }, undefined, principal)).toMatchObject({ ok: true })
    }
    for (const [principal, label] of [[alice, 'Alice'], [bob, 'Bob']] as const) {
      expect(await f.read('runtime-memory', {}, undefined, principal)).toMatchObject({ ok: true, value: { entries: [{ content: label }] } })
      expect(await f.read('documents', { workspaceId: 'shared' }, undefined, principal)).toMatchObject({ ok: true, value: { activeCount: 1 } })
      const file = join(f.root, 'accounts', f.accounts.key(principal), 'runtime', 'MEMORY.md')
      expect(readFileSync(file, 'utf8')).toContain(label)
      expect(readFileSync(file, 'utf8')).not.toContain(label === 'Alice' ? 'Bob' : 'Alice')
    }
    expect(f.live.forAgent(f.sessions[0]!).directory).not.toBe(f.live.forAgent(f.sessions[1]!).directory)
  })

  it('keeps storage inventory and active settings generations inside one account', async () => {
    const f = await fixture()
    const graph = f.live.forAgent(f.sessions[0]!)
    expect(graph.storage.catalog(f.sessions[0]!.session.header!.cwd).scopes.map(scope => scope.root)).toEqual([graph.directory])
    const unpin = f.live.bindAgentRuntime(f.sessions[0]!.id, graph)
    try {
      expect(await f.settings('mutate', { ops: [{ op: 'set', path: ['defaultRecallLimit'], value: 4 }] }, undefined, alice)).toMatchObject({ ok: true })
      expect(f.live.forAgent(f.sessions[0]!)).toBe(graph)
      expect(f.live.forAgent(f.sessions[1]!).config.defaultRecallLimit).toBe(10)
    } finally { unpin() }
    expect(f.live.forAgent(f.sessions[0]!).config.defaultRecallLimit).toBe(4)
  })

  it.skipIf(!process.env.MNEMON_NATIVE_TEST_CLI)('separates real Native databases, catalog reads and cross-account memory ids', async () => {
    const f = await fixture()
    const spaces: Record<string, string> = {}
    for (const principal of [alice, bob]) {
      const graph = f.live.forAgent(f.sessions[principal.id === '1' ? 0 : 1]!)
      const body = await graph.source('memory-spaces').mutate<{ id: string }>('body-create', { name: 'Private memory', description: 'Account fixture', providerId: 'mnemon-native', active: true })
      spaces[principal.id] = body.id
      await graph.source('memory-spaces').mutate('remember', { memoryBodyId: body.id, content: 'Native-account-' + principal.id, category: 'fact', source: 'user' })
    }
    for (const principal of [alice, bob]) {
      const body = { sourceInstanceKey: 'source:mnemon-source-memory-spaces', operation: 'list', input: { memoryBodyIds: [spaces[principal.id]], limit: 10 } }
      const result = await f.read('source-management-read', body, undefined, principal)
      expect(result.ok).toBe(true)
      expect(JSON.stringify(result)).toContain('Native-account-' + principal.id)
      const other = principal.id === '1' ? '2' : '1'
      const foreign = await f.read('source-management-read', { ...body, input: { memoryBodyIds: [spaces[other]], limit: 10 } }, undefined, principal)
      expect(JSON.stringify(foreign)).not.toContain('Native-account-' + other)
    }
  }, 30_000)

  it('ignores browser identities and rejects anonymous or cross-account resource requests', async () => {
    const f = await fixture()
    expect(await f.read('runtime-memory', { principal: alice })).toMatchObject({ ok: false })
    expect(await f.read('runtime-memory', { sessionId: 'bob-session' }, undefined, alice)).toMatchObject({ ok: false })
    expect(await f.read('runtime-memory', { workspaceId: 'bob-only' }, undefined, alice)).toMatchObject({ ok: false })
    expect(await f.read('runtime-memory', { sessionId: 'missing' }, undefined, alice)).toMatchObject({ ok: false })
    expect(await f.read('runtime-memory', { userId: '2', principal: bob }, undefined, alice)).toMatchObject({ ok: true, value: { entries: [] } })
    expect(await f.read('runtime-memory', {}, undefined, { ...alice, source: 'forged' })).toMatchObject({ ok: false })
  })

  it('rejects revoked account access without a resource id and applies the deployment model policy', async () => {
    const f = await fixture()
    expect(await f.settings('mutate', { ops: [{ op: 'set', path: ['taskAgentModel'], value: { mode: 'fixed', provider: 'codex', model: 'gpt-5.5' } }] }, undefined, alice)).toMatchObject({ ok: false })
    expect(await f.settings('mutate', { ops: [{ op: 'set', path: ['taskAgentModel'], value: { mode: 'fixed', provider: 'codex', model: 'gpt-6-astra' } }] }, undefined, alice)).toMatchObject({ ok: true })
    const catalog = f.accounts.handler(async () => ({ ok: true, value: { groups: [{ id: 'codex', name: 'Codex', models: [{ id: 'gpt-5.5' }, { id: 'gpt-6-astra' }] }], failures: [] } }), 'read')
    expect(await catalog('task-agent-models', {}, undefined, alice)).toMatchObject({ ok: true, value: { groups: [{ models: [{ id: 'gpt-6-astra' }] }] } })
    f.active.delete(alice.id)
    expect(await f.read('runtime-memory', {}, undefined, alice)).toMatchObject({ ok: false })
  })

  it('keeps concurrent handlers in their initiating account after another account completes', async () => {
    const f = await fixture()
    let entered!: () => void, release!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    const resume = new Promise<void>(resolve => { release = resolve })
    const handler = f.accounts.handler(async () => {
      entered()
      await resume
      expect(f.accounts.current()).toEqual(alice)
      return createWriteHandler(f.live)('runtime-memory', { action: 'add', target: 'user', content: 'Alice private preference' })
    }, 'write')
    const first = handler('delayed', {}, undefined, alice)
    await ready
    try { expect(await f.read('runtime-memory', {}, undefined, bob)).toMatchObject({ ok: true, value: { entries: [] } }) }
    finally { release() }
    expect(await first).toMatchObject({ ok: true })
    expect(await f.read('runtime-memory', {}, undefined, bob)).toMatchObject({ ok: true, value: { entries: [] } })
    expect(f.accounts.current()).toBeUndefined()
  })

  it('persists independent preferences and refuses storage or provider redirection', async () => {
    const f = await fixture()
    expect(await f.settings('mutate', { ops: [{ op: 'set', path: ['defaultRecallLimit'], value: 3 }] }, undefined, alice)).toMatchObject({ ok: true })
    expect(await f.settings('get', {}, undefined, alice)).toMatchObject({ ok: true, value: { value: { defaultRecallLimit: 3 } } })
    expect(f.live.forAgent(f.sessions[0]!).config.defaultRecallLimit).toBe(3)
    expect(f.live.forAgent(f.sessions[1]!).config.defaultRecallLimit).toBe(10)
    for (const [key, value] of [['dataDir', '/other/account'], ['runtimeUserScope', 'global'], ['cliPath', '/bin/sh'], ['persistenceStrategy', {}]] as const) {
      expect(await f.settings('mutate', { ops: [{ op: 'set', path: [key], value }] }, undefined, alice)).toMatchObject({ ok: false })
    }
    expect(await f.settings('get', { namespace: 'mnemon-account-' + f.accounts.key(bob) }, undefined, alice)).toMatchObject({ ok: false })
  })

  it('uses account ownership for registered model tools and rejects a forged execution owner', async () => {
    const f = await fixture()
    f.scoped.tools.register({ name: 'memory-fixture', execute: async (_args, execution) => {
      expect(f.accounts.current()).toEqual(bob)
      return f.live.forAgent(execution.agent!).directory
    } } as ToolDefinition)
    const execute = f.tools[0]!.execute
    const execution = { agent: f.sessions[1]!, principal: bob, signal: new AbortController().signal }
    expect(await execute({} as never, execution)).toContain(f.accounts.key(bob))
    await expect(execute({} as never, { ...execution, principal: alice })).rejects.toThrow('mismatch')
  })

  it('pins an authorized child to its parent account and carries the owner into new worker requests', async () => {
    const f = await fixture()
    const child = agent('child', bob, f.sessions[1]!.session.header!.cwd!)
    child.session.header = { ...child.session.header, origin: 'subagent', parentSession: 'bob-session' }
    f.sessions.push(child)
    await f.accounts.execute(child, async () => {
      expect(f.live.forAgent(child).directory).toBe(f.live.forAgent(f.sessions[1]!).directory)
      await f.scoped.subagents.start('spawn', { parent: child, prompt: [], signal: new AbortController().signal })
    })
    expect(f.ctx.subagents.start).toHaveBeenCalledWith('spawn', expect.objectContaining({ principal: bob }))
    child.session.events = [{ type: 'turn/start', data: { turn: 2, principal: alice } }]
    await expect(f.accounts.execute(child, async () => {})).rejects.toThrow('parent account mismatch')
  })

  it('keeps an explicit background task and injected messages under the requesting account', async () => {
    const f = await fixture()
    const run = f.accounts.handler(async () => {
      const task = await f.scoped.agents.create!({ sessionId: 'temporary-task' })
      await f.accounts.execute(task.agent, async () => {
        expect(f.live.forAgent(task.agent).directory).toContain(f.accounts.key(bob))
        task.agent.inject({ id: 'injected', role: 'user', source: { kind: 'plugin', plugin: 'dsh-mnemon' }, content: [] })
      })
      expect(task.agent.inject).not.toBeUndefined()
      return { ok: true, value: true }
    }, 'write')
    expect(await run('task', { sessionId: 'bob-session' }, undefined, bob)).toMatchObject({ ok: true })
    expect(f.ctx.agents.get('temporary-task')!.inject).toHaveBeenCalledWith(expect.objectContaining({ principal: bob }))
  })

  it('refuses shared plugin mutation and alternative local provider configuration', async () => {
    const f = await fixture()
    const handler = vi.fn<HostRpcHandler>(async () => ({ ok: true, value: true }))
    for (const channel of ['viewWrite', '/dsh-mnemon-view-settings']) expect(await f.accounts.handler(handler, channel)('apply', {}, undefined, alice)).toMatchObject({ ok: false })
    expect(await f.accounts.handler(handler, 'write')('version-update', {}, undefined, alice)).toMatchObject({ ok: false })
    expect(await f.accounts.handler(handler, 'write')('source-management-mutate', { operation: 'provider-service-update' }, undefined, alice)).toMatchObject({ ok: false })
    expect(handler).not.toHaveBeenCalled()
  })

  it('separates counters and last task identifiers between accounts', async () => {
    const f = await fixture()
    const counters = f.accounts.state<{ count: number; last?: string }>({ count: 0 })
    const handler = f.accounts.handler(async (_endpoint, payload) => {
      if (payload === 'increment') { counters.count++; counters.last = 'alice-private-task' }
      return { ok: true, value: { ...counters } }
    }, 'read')
    expect(await handler('state', 'increment', undefined, alice)).toMatchObject({ ok: true, value: { count: 1 } })
    expect(await handler('state', {}, undefined, bob)).toEqual({ ok: true, value: { count: 0 } })
  })
})
