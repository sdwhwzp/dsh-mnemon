import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadHandler, createWriteHandler } from '../src/host/rpc.ts'
import type { MnemonLifecycle } from '../src/host/lifecycle.ts'
import { LiveMnemonRuntime } from '../src/host/runtime.ts'
import { compositionFixture } from './fixtures/composition.ts'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => { for (const release of cleanup.splice(0).reverse()) await release() })

async function fixture(registered: boolean) {
  const f = await compositionFixture({}, { entryPrefix: 'include' })
  cleanup.push(f.dispose)
  const workspace = { id: 'workspace', path: f.workspace, title: 'Project' }
  const stat = vi.fn(async (_id: string, _options?: { signal?: AbortSignal }) => ({ header: { cwd: f.workspace } }))
  const agents = { get: vi.fn(() => undefined), roots: () => [], create: vi.fn() }
  const live = new LiveMnemonRuntime(f.graph, {
    list: () => registered ? [workspace] : [], get: id => registered && id === workspace.id ? workspace : undefined,
  }, agents, f.extensions, undefined, { stat })
  cleanup.push(() => live.dispose())
  return { ...f, stat, agents, live, read: createReadHandler(live), write: createWriteHandler(live) }
}

describe('persisted session project documents', () => {
  it.each([true, false])('reads and edits a cold session workspace without activating it (registered: %s)', async registered => {
    const f = await fixture(registered)
    const request = { sessionId: 'cold-session', sourceInstanceKey: 'source:include:mnemon-source-documents' }
    const before = await f.read('source-management-read', { ...request, operation: 'snapshot' })
    expect(before).toMatchObject({ ok: true, value: { value: { workspaceRoot: f.workspace, activeCount: 0 } } })
    if (!before.ok) throw new Error(before.error.message)
    const revision = (before.value as { revision: string }).revision
    expect(await f.write('source-management-mutate', { ...request, operation: 'mutate', expectedRevision: revision, confirmed: true,
      input: { action: 'create', title: 'Saved project', description: '', content: 'Durable project notes' },
    })).toMatchObject({ ok: true })
    expect(await f.read('source-management-read', { ...request, operation: 'snapshot' })).toMatchObject({
      ok: true, value: { value: { activeCount: 1, documents: [expect.objectContaining({ title: 'Saved project' })] } },
    })
    expect(f.stat).toHaveBeenCalledWith('cold-session', undefined)
    expect(f.agents.create).not.toHaveBeenCalled()
  })

  it('creates through the workbench assistance endpoint without requiring a live Agent', async () => {
    const f = await fixture(true)
    const coordinator = { workspaceRoot: () => undefined, snapshot: () => ({ taskAgentAvailable: false }), mutateDocument: vi.fn() }
    const lifecycle = coordinator as unknown as MnemonLifecycle
    const request = { sessionId: 'cold-session', sourceInstanceKey: 'source:include:mnemon-source-documents' }
    const catalog = await createReadHandler(f.live, lifecycle)('source-management-catalog', request)
    if (!catalog.ok) throw new Error(catalog.error.message)
    const source = (catalog.value as { sources: Array<{ sourceInstanceKey: string; revision: string }> }).sources.find(item => item.sourceInstanceKey === request.sourceInstanceKey)!
    expect(await createWriteHandler(f.live, lifecycle)('source-assistance', { ...request, operation: 'mutate', expectedRevision: source.revision, confirmed: true,
      input: { action: 'create', title: 'Workbench document', content: 'Saved without activating a session' },
    })).toMatchObject({ ok: true })
    expect(coordinator.mutateDocument).not.toHaveBeenCalled()
  })

  it('forwards cancellation and reports failed metadata reads without using another workspace', async () => {
    const f = await fixture(true)
    f.stat.mockRejectedValueOnce(new Error('Stored session metadata unavailable'))
    const signal = new AbortController().signal
    expect(await f.read('documents', { sessionId: 'cold-session' }, signal)).toMatchObject({ ok: false, error: { message: 'Stored session metadata unavailable' } })
    expect(f.stat).toHaveBeenCalledWith('cold-session', { signal })
  })
})
