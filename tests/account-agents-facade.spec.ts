// The scoped `agents` facade account mode installs in place of the runtime
// registry. It filters what an account may see, so every member it forgets to
// carry disappears for the whole plugin: the background review reads
// `isOwnedBy` off this object and fails closed when it is absent.
import { describe, expect, it } from 'vitest'
import { MnemonAccounts } from '../src/host/account-access.ts'
import type { HostAgent, HostContextShape } from '../src/host/dsh.ts'

/** One agent the registry owns, with the shape `wrapAgent` proxies. */
function hostAgent(id: string): HostAgent {
  return { id, ctx: {}, session: { header: {} } } as unknown as HostAgent
}

/**
 * A context exposing only what `wrapContext()` reads, with the registry call
 * recorded so a test can see which agent object reached it.
 */
function fakeContext(agent: HostAgent, options: { ownership: boolean }) {
  const seen: HostAgent[] = []
  const agents = {
    get: (id: string) => (id === agent.id ? agent : undefined),
    roots: () => [agent],
    ...options.ownership
      ? { isOwnedBy: (_id: string, parent: HostAgent) => { seen.push(parent); return parent === agent } }
      : {},
  }
  return { ctx: { agents } as unknown as HostContextShape, seen }
}

describe('the scoped agents facade', () => {
  it('carries isOwnedBy and hands the registry the unwrapped parent', () => {
    const agent = hostAgent('parent-1')
    const { ctx, seen } = fakeContext(agent, { ownership: true })
    const accounts = new MnemonAccounts(ctx, '/tmp/mnemon-facade', { accountDataDir: '/tmp/mnemon-facade', cliPath: '/fake/mnemon' } as never)

    const scoped = accounts.wrapContext()
    const wrapped = scoped.agents.get('parent-1')
    expect(wrapped).toBeDefined()
    expect(wrapped).not.toBe(agent)

    expect(scoped.agents.isOwnedBy?.('child-1', wrapped!)).toBe(true)
    // The proxy would compare unequal inside the registry, which is exactly how
    // a review loses ownership of the child it just started.
    expect(seen).toEqual([agent])
  })

  it('omits isOwnedBy when the runtime registry does not publish it', () => {
    const agent = hostAgent('parent-2')
    const { ctx } = fakeContext(agent, { ownership: false })
    const accounts = new MnemonAccounts(ctx, '/tmp/mnemon-facade', { accountDataDir: '/tmp/mnemon-facade', cliPath: '/fake/mnemon' } as never)

    expect(accounts.wrapContext().agents.isOwnedBy).toBeUndefined()
  })
})
