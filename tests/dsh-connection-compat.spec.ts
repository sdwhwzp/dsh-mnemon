import { Context, Service } from '@deepseek-ai/cordis'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Mnemon from '../src/host/plugin.ts'
import type {
  HostConnectionHandle,
  HostRpcHandler,
  HostSettingsService,
} from "../src/host/dsh.ts"
import { registerSettingsRpc } from "../src/host/settings.ts"
import { MNEMON_SETTINGS_CHANNEL } from "../src/host/protocol.ts"
import { MnemonRemoteService } from '../src/host/remote-rpc.ts'
import { VersionUpdateManager } from '../src/host/version-updates.ts'

interface RegisteredRoute {
  path: string
}

interface BranchFreeConnection {
  rpc: {
    handle(channel: string, handler: HostRpcHandler): () => Promise<void>
  }
}

type BranchFreeConnectionConstructor = new (
  context: Context,
  trustedHosts: readonly string[],
  browserAuth: {
    isAuthenticated(request: unknown): boolean
    authorizeIndex(request: unknown, response: unknown): boolean
    authenticatedUrl(baseUrl: string): string
  },
) => BranchFreeConnection

describe('released and source DSH Connection compatibility', () => {
  it('registers account Web RPC from a mounted plugin with Cordis injection checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mnemon-web-account-'))
    const versionCheck = vi.spyOn(VersionUpdateManager.prototype, 'check').mockResolvedValue({
      checkedAt: '2026-10-03T00:00:00.000Z',
      components: [{ id: 'dsh-mnemon', name: 'dsh-mnemon', current: '0.5.21', latest: '0.5.22',
        installMode: 'npm', outdated: true, updateSupported: true, updateHint: 'dsh',
        packages: [{ id: 'dsh-mnemon-source-documents', name: 'Documents', kind: 'source', current: '0.5.21', latest: '0.5.22',
          installMode: 'npm', outdated: true, updateSupported: true, updateHint: 'dsh', managedBy: 'profile' }] }],
    })
    const update = vi.spyOn(VersionUpdateManager.prototype, 'update')
    const context = new Context()
    const routes: RegisteredRoute[] = []
    try {
      class RouteRegistry extends Service {
        constructor(ctx: Context) { super(ctx, 'webServer') }
        register(route: RegisteredRoute) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } }
        registerUpgrade() { return () => {} }
      }
      await context.plugin(RouteRegistry)
      const config = { accountDataDir: root, cliPath: '/unused/mnemon', remoteAccess: 'trusted-host' as const }
      const entry = { id: 'include:mnemon', options: { id: 'mnemon', config } }
      context.provide('settings', {
        writable: true, configure: () => () => {},
        describe: () => [{ ns: 'mnemon', value: config, base: config, user: {}, revision: 0, applies: 'live' }],
      } as never)
      context.provide('configEditor', { entries: () => [entry] } as never)
      context.provide('tools', { register: () => () => {} } as never)
      context.provide('commands', { register: () => () => {} } as never)
      context.provide('agents', { get: () => undefined, roots: () => [] } as never)
      context.provide('subagents', { list: () => [], start: vi.fn() } as never)
      const principal = { source: 'dsh-passwords', id: '1', username: 'alice', role: 'user' }
      context.provide('requestPrincipal', { authenticate: async () => principal } as never)
      context.provide('principalAccess', { assertAuthenticated: () => {}, resolve: async () => ({ readableSessionIds: new Set(), readableWorkspaceIds: new Set() }) } as never)
      new TypertRegistry(context)
      const Connection = HostConnectionService as unknown as BranchFreeConnectionConstructor
      const connection = new Connection(context, [], { isAuthenticated: () => true, authorizeIndex: () => true, authenticatedUrl: value => value }) as unknown as HostConnectionService
      new TypertGatewayService(context, { websocketHeartbeatIntervalMs: 2_000 })
      await context.plugin({ ...Mnemon, apply(ctx: Context, value: Mnemon.MnemonConfig) {
        Object.assign(ctx.fiber, { entry })
        Mnemon.apply(ctx, value)
      } }, config)
      for (const runtime of context.registry.values()) for (const fiber of runtime.fibers) await fiber.await()
      const response = await connection.createSharedFetchHandler('/api').fetch(new Request('http://127.0.0.1/api/dshMnemon/settings', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          type: 'client-request', rpcId: 'account-settings', method: 'dshMnemon/settings', payload: { args: { endpoint: 'get', payload: {} } },
        }),
      }))
      expect(response.status).toBe(200)
      const reply = await response.json()
      expect(reply, JSON.stringify(reply)).toMatchObject({ result: { ok: true, value: { ok: true, value: { value: { accountDataDir: root, defaultRecallLimit: 10 } } } } })
      expect(routes.some(route => route.path === '/dsh-mnemon-settings')).toBe(true)
      const request = async (method: string, endpoint: string, payload: unknown) => {
        const response = await connection.createSharedFetchHandler('/api').fetch(new Request(`http://127.0.0.1/api/${method}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
            type: 'client-request', rpcId: endpoint, method, payload: { args: { endpoint, payload } },
          }),
        }))
        expect(response.status).toBe(200)
        return response.json()
      }
      const versions = await request('dshMnemon/read', 'versions', {})
      expect(versions).toMatchObject({ result: { ok: true, value: { ok: true, value: {
        components: [{ current: '0.5.21', latest: '0.5.22', updateSupported: false,
          packages: [{ current: '0.5.21', latest: '0.5.22', updateSupported: false }] }],
      } } } })
      for (const method of ['dshMnemon/read', 'dshMnemon/write', 'dshMnemon/settings']) {
        expect(await request(method, 'version-update', { component: 'dsh-mnemon' }))
          .toMatchObject({ result: { ok: true, value: { ok: false } } })
      }
      expect(versionCheck).toHaveBeenCalledOnce()
      expect(update).not.toHaveBeenCalled()
    } finally {
      await context.fiber.dispose()
      versionCheck.mockRestore()
      update.mockRestore()
      expect(routes).toEqual([])
      await rm(root, { recursive: true, force: true })
    }
  })

  it('registers the same legacy-options call against the active real implementation', async () => {
    const routes: RegisteredRoute[] = []
    const context = new Context()
    context.provide('webServer', {
      register(route: RegisteredRoute) {
        routes.push(route)
        return () => { routes.splice(routes.indexOf(route), 1) }
      },
    } as never)
    const Connection = HostConnectionService as unknown as BranchFreeConnectionConstructor
    const connection = new Connection(context, [], {
      isAuthenticated: () => true,
      authorizeIndex: () => true,
      authenticatedUrl: value => value,
    })

    registerSettingsRpc(
      connection as unknown as HostConnectionHandle,
      {} as HostSettingsService,
    )

    expect(routes.map(route => route.path)).toEqual([MNEMON_SETTINGS_CHANNEL])
  })

  it('dispatches a namespaced Mnemon read through the released shared API contract', async () => {
    const context = new Context()
    context.provide('webServer', { register: () => () => {}, registerUpgrade: () => () => {} } as never)
    new TypertRegistry(context)
    const Connection = HostConnectionService as unknown as BranchFreeConnectionConstructor
    const connection = new Connection(context, [], {
      isAuthenticated: () => true,
      authorizeIndex: () => true,
      authenticatedUrl: value => value,
    }) as unknown as HostConnectionService
    new TypertGatewayService(context, { websocketHeartbeatIntervalMs: 2_000 })
    const read = vi.fn(async endpoint => ({ ok: true as const, value: { endpoint, healthy: true } }))
    const unavailable: HostRpcHandler = vi.fn(async () => ({ ok: false as const, error: { code: 'internal' as const, message: 'unused', details: {} } }))
    new MnemonRemoteService(context, {
      read,
      activation: unavailable,
      write: unavailable,
      pack: unavailable,
      settings: unavailable,
      view: unavailable,
      viewWrite: unavailable,
      management: false,
    })
    for (const runtime of context.registry.values()) {
      for (const fiber of runtime.fibers) await fiber.await()
    }

    const endpoint = 'dshMnemon/read'
    const response = await connection.createSharedFetchHandler('/api').fetch(new Request(`http://127.0.0.1/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId: 'compat-rpc', method: endpoint,
        payload: { args: { endpoint: 'status-summary', payload: {} } },
      }),
    }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      type: 'server-response',
      rpcId: 'compat-rpc',
      result: { ok: true, value: { ok: true, value: { endpoint: 'status-summary', healthy: true } } },
    })
    expect(read).toHaveBeenCalledWith('status-summary', {}, expect.any(AbortSignal))
  })
})
