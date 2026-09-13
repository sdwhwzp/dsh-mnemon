/**
 * The shared memory instance: one Host-owned memory-spaces Source every
 * account reads and only an admin account writes. The Host assigns its
 * directory and its write permission, so neither the entry in
 * cordis.patch.yml nor an account's own settings can move it or open it.
 *
 * @module dsh-mnemon/test/shared-memory.spec
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memorySettings } from './helpers/account-settings.ts'
import { MnemonAccounts } from '../src/host/account-access.ts'
import { resolveConfig } from '../src/host/config.ts'
import type { HostContextShape, HostPrincipal } from '../src/host/dsh.ts'
import { isSharedMemoryInstance } from '../src/host/protocol.ts'
import { memoryGenerationOptions } from '../src/host/runtime.ts'

const cleanups: Array<() => unknown> = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

const admin: HostPrincipal = { source: 'dsh-passwords', id: '1', username: 'admin', role: 'admin' }
const member: HostPrincipal = { source: 'dsh-passwords', id: '2', username: 'member', role: 'user' }

function dirs(): { accounts: string; shared: string } {
  const root = mkdtempSync(join(tmpdir(), 'mnemon-shared-'))
  cleanups.push(() => { rmSync(root, { recursive: true, force: true }) })
  return { accounts: join(root, 'accounts'), shared: join(root, 'shared') }
}

/** The installed-source shape `sourceConfiguration` reads. */
function installed(instanceKey: string, typeId: string): never {
  return { instanceKey, definition: { manifest: { typeId } } } as never
}

const SHARED_KEY = 'source:mnemon-bundle:mnemon-source-memory-spaces-shared'
const ACCOUNT_KEY = 'source:mnemon-bundle:mnemon-source-memory-spaces'

describe('shared memory instance', () => {
  it('is recognized only by the Host-owned entry suffix', () => {
    expect(isSharedMemoryInstance(SHARED_KEY)).toBe(true)
    expect(isSharedMemoryInstance(ACCOUNT_KEY)).toBe(false)
    expect(isSharedMemoryInstance('mnemon-source-memory-spaces-shared')).toBe(false)
  })

  it('takes the Host directory and stays read-only for a member account', () => {
    const { accounts, shared } = dirs()
    const config = resolveConfig({ accountDataDir: accounts, sharedMemoryDir: shared, dataDir: join(accounts, 'a'), storageScope: 'custom' })
    const options = memoryGenerationOptions(config, undefined)
    const applied = options.sourceConfiguration?.(installed(SHARED_KEY, 'memory-spaces')) as Record<string, unknown>
    expect(applied['dataDir']).toBe(shared)
    expect(applied['writeEnabled']).toBe(false)
  })

  it('is writable for an admin account', () => {
    const { accounts, shared } = dirs()
    const config = resolveConfig({ accountDataDir: accounts, sharedMemoryDir: shared, sharedMemoryWritable: true, dataDir: join(accounts, 'a'), storageScope: 'custom' })
    const applied = memoryGenerationOptions(config, undefined).sourceConfiguration?.(installed(SHARED_KEY, 'memory-spaces')) as Record<string, unknown>
    expect(applied['writeEnabled']).toBe(true)
  })

  it('never lets the shared instance land in an account directory', () => {
    const { accounts, shared } = dirs()
    const config = resolveConfig({ accountDataDir: accounts, sharedMemoryDir: shared, dataDir: join(accounts, 'a'), storageScope: 'custom' })
    const options = memoryGenerationOptions(config, undefined)
    const sharedApplied = options.sourceConfiguration?.(installed(SHARED_KEY, 'memory-spaces')) as Record<string, unknown>
    const accountApplied = options.sourceConfiguration?.(installed(ACCOUNT_KEY, 'memory-spaces')) as Record<string, unknown>
    expect(sharedApplied['dataDir']).toBe(shared)
    expect(accountApplied['dataDir']).toBe(join(accounts, 'a'))
    expect(sharedApplied['dataDir']).not.toBe(accountApplied['dataDir'])
  })

  it('refuses a shared instance of the wrong Source type or without a directory', () => {
    const { accounts, shared } = dirs()
    const withShared = resolveConfig({ accountDataDir: accounts, sharedMemoryDir: shared, dataDir: join(accounts, 'a'), storageScope: 'custom' })
    expect(() => memoryGenerationOptions(withShared, undefined).sourceConfiguration?.(installed(SHARED_KEY, 'documents')))
      .toThrow(/must be a memory-spaces Source/u)
    const withoutShared = resolveConfig({ accountDataDir: accounts, dataDir: join(accounts, 'a'), storageScope: 'custom' })
    expect(() => memoryGenerationOptions(withoutShared, undefined).sourceConfiguration?.(installed(SHARED_KEY, 'memory-spaces')))
      .toThrow(/requires sharedMemoryDir/u)
  })

  it('still refuses every other extra Source in account mode', () => {
    const { accounts, shared } = dirs()
    const config = resolveConfig({ accountDataDir: accounts, sharedMemoryDir: shared, dataDir: join(accounts, 'a'), storageScope: 'custom' })
    expect(() => memoryGenerationOptions(config, undefined).sourceConfiguration?.(installed('source:x:mnemon-source-memory-spaces-second', 'memory-spaces')))
      .toThrow(/only the bundled default Sources/u)
  })

  it('rejects a shared directory that is relative, unaccompanied, or inside the account tree', () => {
    const { accounts, shared } = dirs()
    expect(() => resolveConfig({ accountDataDir: accounts, sharedMemoryDir: 'relative/shared' })).toThrow(/must be absolute/u)
    expect(() => resolveConfig({ dataDir: join(accounts, 'a'), storageScope: 'custom', sharedMemoryDir: join(accounts, 'a', 'nested') })).toThrow(/must not nest with the memory dataDir/u)
    expect(() => resolveConfig({ accountDataDir: accounts, sharedMemoryDir: join(accounts, 'inside') })).toThrow(/outside accountDataDir/u)
  })
})

describe('shared memory permission comes from the principal', () => {
  function hostContext(): HostContextShape {
    return {
      on: vi.fn(),
      settings: memorySettings(),
      agents: { get: () => undefined, roots: () => [], create: vi.fn() },
      tools: { register: vi.fn() },
      subagents: { start: vi.fn(), list: () => [] },
      commands: { register: vi.fn() },
      get: () => undefined,
      effect: vi.fn(),
    } as never
  }

  it('grants write to an admin and withholds it from a member, ignoring the plugin config', () => {
    const { accounts, shared } = dirs()
    // The plugin config asks for write access for everyone; only the role decides.
    const hosts = new MnemonAccounts(hostContext(), accounts, { sharedMemoryDir: shared, sharedMemoryWritable: true } as never)
    expect(hosts.config(admin).sharedMemoryWritable).toBe(true)
    expect(hosts.config(member).sharedMemoryWritable).toBeUndefined()
    expect(hosts.config(admin).sharedMemoryDir).toBe(shared)
    expect(hosts.config(member).sharedMemoryDir).toBe(shared)
  })

  it('keeps every account directory separate from the shared one', () => {
    const { accounts, shared } = dirs()
    const hosts = new MnemonAccounts(hostContext(), accounts, { sharedMemoryDir: shared } as never)
    const adminDir = hosts.config(admin).dataDir
    const memberDir = hosts.config(member).dataDir
    expect(adminDir).not.toBe(memberDir)
    expect(adminDir).not.toBe(shared)
    expect(memberDir).not.toBe(shared)
  })
})
