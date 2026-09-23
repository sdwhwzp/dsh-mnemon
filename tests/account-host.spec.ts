import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { expect, it } from 'vitest'
import { MnemonAccounts } from '../src/host/account-access.ts'
import type { HostAgent, HostContextShape, HostPrincipal } from '../src/host/dsh.ts'
import { MnemonLifecycle } from '../src/host/lifecycle.ts'
import { LiveMnemonRuntime } from '../src/host/runtime.ts'
import { MnemonSubagentCoordinator } from '../src/host/subagent.ts'
import { registerTools } from '../src/host/tools.ts'
import { createWriteHandler } from '../src/host/rpc.ts'
import { hostSessionEvents } from '../src/host/session-events.ts'
import { compositionFixture } from './fixtures/composition.ts'
import { memorySettings } from './helpers/account-settings.ts'

class SessionReads extends SessionQueryEngine {
  override async searchSessions(): Promise<never> { throw new Error('unexpected text search') }
  override async searchEvents(): Promise<never> { throw new Error('unexpected event search') }
}

type Response = string | { name: string; args: Record<string, unknown> }
class ScriptedAdapter extends LlmAdapter {
  private calls = 0

  constructor(private readonly respond: (options: GenerateOptions) => Response | Promise<Response>) { super() }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = await this.respond(options)
    options.signal?.throwIfAborted()
    const id = `test-call-${++this.calls}` as Extract<StreamChunk, { type: 'tool-call-delta' }>['id']
    if (typeof response === 'string') {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: response }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: response } }
    } else {
      const args = JSON.stringify(response.args)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: response.name, argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: response.name, arguments: args } }
    }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: typeof response === 'string' ? 'stop' : 'tool-calls' } }
  }
}


it('logs and projects each account memory through the real Harness Agent loop and tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mnemon-account-host-'))
  const ctx = new Context()
  const memory = await compositionFixture({}, { nativeOnly: true })
  let live: LiveMnemonRuntime | undefined, stop: (() => void) | undefined
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionReads)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
    ctx.provide('settings', memorySettings() as never)
    ctx.provide('principalAccess', {
      assertAuthenticated(principal: HostPrincipal) { if (!['1', '2'].includes(principal.id)) throw new Error('unknown account') },
      async resolve(principal: HostPrincipal, subjects: { sessionIds: string[] }) {
        return { readableSessionIds: new Set(subjects.sessionIds.filter(id => id === 'owner-' + principal.id)), readableWorkspaceIds: new Set(['shared']) }
      },
    } as never)
    const accounts = new MnemonAccounts(ctx as unknown as HostContextShape, join(root, 'accounts'), { accountDataDir: join(root, 'accounts'), cliPath: '/fake/mnemon' })
    const scoped = accounts.wrapContext()
    live = new LiveMnemonRuntime(memory.graph, { get: id => id === 'shared' ? { id, title: 'Shared', path: memory.workspace } : undefined, list: () => [] }, scoped.agents, memory.extensions, accounts)
    const runtime = live
    const coordinator = new MnemonSubagentCoordinator(scoped.subagents, runtime, scoped, undefined, undefined, undefined, accounts)
    const lifecycle = new MnemonLifecycle(scoped, coordinator, runtime.config, runtime, accounts)
    registerTools(scoped, runtime, coordinator)
    stop = lifecycle.start()
    const children: Agent[] = []
    ctx.on('agent/created', ({ agent }): undefined => { if (agent.session.header.origin === 'subagent') children.push(agent) })
    const prompts: Array<{ sessionId: string; text: string }> = []
    const calls = new Map<string, number>()
    ctx.llm.registerAdapter(['mock'], new ScriptedAdapter(options => {
      prompts.push({ sessionId: String(options.sessionId), text: JSON.stringify(options.messages) })
      const count = calls.get(String(options.sessionId)) ?? 0
      calls.set(String(options.sessionId), count + 1)
      const resultTool = options.tools?.find(tool => tool.name === 'mnemon_subagent_result')
      const requestId = JSON.stringify(options.messages).match(/requestId `([^`]+)`/u)?.[1]
      if (resultTool !== undefined && requestId !== undefined) {
        if (count > 0) throw new Error('The completed memory task requested another model step')
        return { name: resultTool.name, args: { requestId, result: { action: 'skipped', summary: 'No durable facts in this setup task.', memoryBodyIds: [], documentIds: [] } } }
      }
      return count === 0 ? { name: 'mnemon_document_search', args: { query: 'private-token' } } : 'Done.'
    }))
    const principals = ['1', '2'].map(id => ({ source: 'dsh-passwords', id, username: 'user-' + id, role: 'user' as const }))
    const write = accounts.handler(createWriteHandler(runtime), 'write')
    for (const principal of principals) {
      expect(await write('runtime-memory', { action: 'add', target: 'user', content: 'Only-account-' + principal.id }, undefined, principal)).toMatchObject({ ok: true })
      expect(await write('document', { workspaceId: 'shared', action: 'create', title: 'Private', content: 'private-token document-account-' + principal.id }, undefined, principal)).toMatchObject({ ok: true })
    }
    const agents = await Promise.all(principals.map(principal => ctx.agentLoop.create(SessionId('owner-' + principal.id), { provider: 'mock', model: 'mock' }, { cwd: memory.workspace })))
    await Promise.all(agents.map(async (agent, index) => {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Search my private-token document.' }], source: { kind: 'user' }, principal: principals[index]! }))
      await agent.whenIdle()
    }))
    await Promise.all(agents.map(agent => accounts.execute(agent as unknown as HostAgent, async () => {
      const run = await scoped.subagents.start('spawn', { parent: scoped.agents.get(agent.id)!, prompt: [{ type: 'text', text: 'Search my private-token document.' }], signal: new AbortController().signal })
      try { expect(await run.result).toMatchObject({ stopReason: 'completed' }) } finally { await run.dispose() }
    })))
    expect(children).toHaveLength(2)
    for (const child of children) {
      const owner = child.session.header.parentSession === 'owner-1' ? '1' : '2'
      const text = prompts.filter(request => request.sessionId === child.id).map(request => request.text).join('')
      expect(text).toContain('document-account-' + owner)
      expect(text).not.toContain('document-account-' + (owner === '1' ? '2' : '1'))
    }
    await accounts.execute(agents[1]! as unknown as HostAgent, async () => {
      const result = await coordinator.write(scoped.agents.get(agents[1]!.id)!, 'remember', { content: 'Routine setup task' }, new AbortController().signal)
      expect(result).toMatchObject({ action: 'skipped', summary: 'No durable facts in this setup task.', memoryBodyIds: [], documentIds: [] })
      expect(calls.get(result.runId)).toBe(1)
    })
    const background = accounts.handler(async () => {
      const task = await scoped.agents.create!({ sessionId: 'background-2', meta: { cwd: memory.workspace }, agentOptions: { provider: 'mock', model: 'mock' } })
      try {
        task.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Search my private-token document.' }], source: { kind: 'user' } }))
        await (ctx.agents.get(SessionId('background-2'))!).whenIdle()
        return { ok: true, value: true }
      } finally { await task.dispose() }
    }, 'write')
    expect(await background('task', { workspaceId: 'shared' }, undefined, principals[1]!)).toMatchObject({ ok: true })
    const backgroundText = prompts.filter(request => request.sessionId === 'background-2').map(request => request.text).join('')
    expect(backgroundText).toContain('document-account-2')
    expect(backgroundText).not.toContain('document-account-1')
    for (const [index, agent] of agents.entries()) {
      const own = principals[index]!.id, other = own === '1' ? '2' : '1'
      const messages = prompts.filter(request => request.sessionId === agent.id)
      expect(messages.length).toBeGreaterThanOrEqual(2)
      expect(messages[0]!.text).toContain('Only-account-' + own)
      expect(messages.at(-1)!.text).toContain('document-account-' + own)
      expect(messages.map(value => value.text).join('')).not.toMatch(new RegExp('Only-account-' + other + '|document-account-' + other))
      const events = hostSessionEvents((agent as unknown as HostAgent).session)
      const injected = events.filter(event => event.type === 'user/message' && (event.data.source as { kind?: string } | undefined)?.kind === 'dsh-mnemon')
      expect(injected.length).toBeGreaterThan(0)
      expect(injected.every(event => (event.data.principal as HostPrincipal)?.id === own)).toBe(true)
      expect(events.filter(event => event.type === 'error')).toEqual([])
    }
  } finally {
    try { await ctx.fiber.dispose() } finally { stop?.(); live?.dispose(); await memory.dispose(); await rm(root, { recursive: true, force: true }) }
  }
}, 15_000)
