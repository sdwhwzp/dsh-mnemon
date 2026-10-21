import { Context } from '@deepseek-ai/cordis'
import { Config as PlainConfig, InteractionConfig, resolveConfig, resolveInteractionConfig, SkillsConfig, type Config as MnemonConfig } from './config.ts'
import { MnemonAutoBackupScheduler } from './auto-backup.ts'
import { registerCommands } from './commands.ts'
import type { HostContextShape, HostSessionPersistence, HostCredentialsService, HostWorkspaceRegistry } from './dsh.ts'
import { githubGrantFromRecord, MNEMON_SYNC_GITHUB_CREDENTIAL_KEY, MnemonGitHubAuth, type MnemonGitHubCredentialPort } from './github-auth.ts'
import { registerGuidance } from './guidance.ts'
import { createRuntimeGraph, LiveMnemonRuntime } from './runtime.ts'
import { MnemonLifecycle } from './lifecycle.ts'
import { SkillEvolution } from './skill-evolution.ts'
import { DEFAULT_SKILLS_CONFIG, type ResolvedSkillsConfig } from './protocol.ts'
import { skillsSourceFor } from './skill-source.ts'
import { registerRpc } from './rpc.ts'
import { migrateLegacyDisplayMode, registerSettingsRpc } from './settings.ts'
import { MnemonSubagentCoordinator } from './subagent.ts'
import { registerTools } from './tools.ts'
import { registerMnemonSubagentTokenUsageProjection } from './subagent-token-usage.ts'
import { provideMemoryRuntime } from '../core/runtime.ts'
import { MemoryPluginManagement } from './plugin-management.ts'
import { registerViewRpc } from './view-rpc.ts'
import { MemoryPluginInstallation } from './plugin-installation.ts'
import { MnemonRemoteService } from './remote-rpc.ts'
import { MnemonAccountSync } from './account-sync.ts'
import { MnemonAccounts } from './account-access.ts'
import { join } from 'node:path'
import { plainHostConfig, type LiveHostConfig } from './live-config.ts'
import { ProfileMnemonSettings } from './settings-service.ts'
import { dshPluginCommand, VersionUpdateManager, type DshBundleInstaller } from './version-updates.ts'

export const name = 'dsh-mnemon'
export const provide = ['mnemonMemory']
export const inject = ['tools', 'settings', 'commands', 'agents', 'subagents']
export { LiveConfig as Config } from './live-config.ts'
export type { MnemonConfig }

/** Resolve the optional Web workspace service at call time, not plugin-mount time. */
function optionalWorkspaceRegistry(ctx: HostContextShape): HostWorkspaceRegistry {
  const current = (): HostWorkspaceRegistry | undefined => ctx.get('workspaceRegistry') as HostWorkspaceRegistry | undefined
  return {
    get: id => current()?.get(id),
    list: () => current()?.list() ?? [],
  }
}

/**
 * The one credentials record this plugin keeps, as DSH's store addresses it:
 * `<scope>/<id>`. Presence of the record is the whole fact, and every write
 * goes through `modifyRecord` so a replacement happens under the store's lock.
 */
function credentialPort(service: () => HostCredentialsService | undefined, key: string): MnemonGitHubCredentialPort {
  return {
    available: () => service() !== undefined,
    describe: async () => {
      const store = service()
      if (store === undefined) return { configured: false, writable: false }
      const info = await store.describeRecord(key)
      return { configured: info.configured, writable: info.writable }
    },
    read: async () => githubGrantFromRecord(await service()?.readRecord(key)),
    write: async grant => {
      const store = service()
      if (store === undefined) throw new Error('this DSH Host provides no credentials store, so GitHub sign-in is unavailable')
      await store.modifyRecord(key, async () => ({ kind: 'grant', payload: grant }))
    },
    clear: async () => {
      const store = service()
      if (store === undefined) return
      // An absent record is already the signed-out state; deleting one twice is not a failure.
      if (await store.readRecord(key) === undefined) return
      await store.deleteRecord(key)
    },
  }
}

/**
 * GitHub sign-in lives beside the sync channel, not inside it: one instance
 * spans every runtime generation, so a grant stored from the settings page is
 * the same one an Agent's workspace graph resolves. The credentials service is
 * read at call time, because a Headless profile may mount none at all.
 */
function optionalGitHubAuth(ctx: HostContextShape, key = MNEMON_SYNC_GITHUB_CREDENTIAL_KEY): MnemonGitHubAuth {
  const current = (): HostCredentialsService | undefined => (ctx.get('credentials') ?? ctx.credentials) as HostCredentialsService | undefined
  return new MnemonGitHubAuth(credentialPort(current, key))
}

/** DSH owns assembly; this Host only wires scope, phases and user preferences. */
export function apply(rawContext: unknown, rawConfig: MnemonConfig | LiveHostConfig = {}): void {
  const original = rawContext as HostContextShape
  const config = plainHostConfig(rawConfig)
  const accountDataDir = resolveConfig(config).accountDataDir
  const hostSettings = new ProfileMnemonSettings(original, rawConfig)
  const accounts = accountDataDir === undefined ? undefined : new MnemonAccounts(original, accountDataDir, config, hostSettings)
  const ctx = accounts?.wrapContext() ?? original
  registerMnemonSubagentTokenUsageProjection(ctx)
  const extensions = provideMemoryRuntime(ctx)
  const memoryPlugins = new MemoryPluginManagement(ctx, extensions, hostSettings)
  const pluginInstallation = new MemoryPluginInstallation(ctx)
  const effectiveConfig = (value: MnemonConfig) => memoryPlugins.resolveConfig(resolveConfig(accountDataDir === undefined ? value : {
    ...value, storageScope: 'custom', runtimeUserScope: 'storage', customPacks: [], dataDir: join(accountDataDir, '_host-control'),
  }), value.memoryView ?? { entries: {} })
  const settings = hostSettings.register<MnemonConfig>('mnemon', PlainConfig, {
    base: config,
    applies: 'live',
    // Profile writes commit asynchronously. Check that the candidate composes
    // now, then build from the committed live references on volatile-update.
    validate: value => createRuntimeGraph(effectiveConfig(value), undefined, extensions).dispose(),
  })
  const runtime = new LiveMnemonRuntime(createRuntimeGraph(effectiveConfig(settings.get()), undefined, extensions), optionalWorkspaceRegistry(ctx), ctx.agents, extensions, accounts, {
    stat: async (id, options) => (ctx.get('sessionPersistence') as HostSessionPersistence | undefined)?.stat(id, options),
  })
  const accountSync = accounts === undefined ? undefined : new MnemonAccountSync(runtime, accounts,
    key => optionalGitHubAuth(ctx, 'dsh-mnemon/github-account-' + key))
  const autoBackup = accounts === undefined ? new MnemonAutoBackupScheduler(runtime) : undefined
  if (autoBackup !== undefined) {
    runtime.useGitHubAuth(optionalGitHubAuth(ctx))
    runtime.useAutoBackup(() => autoBackup.snapshot())
  }
  const resolved = runtime.config
  ctx.effect(() => hostSettings.onUpdated((namespace, value) => {
    if (namespace === memoryPlugins.settingsNamespace) {
      runtime.swap(createRuntimeGraph(effectiveConfig(settings.get()), undefined, extensions))
      return
    }
    if (namespace !== 'mnemon') return
    runtime.swap(createRuntimeGraph(effectiveConfig(value as MnemonConfig), undefined, extensions))
  }), 'dsh-mnemon: live runtime settings')
  ctx.effect(() => memoryPlugins.start(), 'dsh-mnemon: plugin graph settings')
  hostSettings.register('mnemon-ui', InteractionConfig, {
    base: resolveInteractionConfig(resolved.conversationInteraction),
    applies: 'live',
  })
  // 技能管理's settings: read at every turn and review, so a change applies at once.
  const skillSettings = hostSettings.register<ResolvedSkillsConfig>('mnemon-skills', SkillsConfig, {
    base: { ...DEFAULT_SKILLS_CONFIG },
    applies: 'live',
  })
  ctx.effect(() => {
    let disposed = false
    const migrate = (): void => {
      if (disposed) return
      void migrateLegacyDisplayMode(hostSettings).catch(error => {
        console.warn('dsh-mnemon: could not persist the builtin displayMode migration', error)
      })
    }
    const unsubscribe = ctx.on('settings/document-updated', ((namespace: string) => {
      if (namespace === 'mnemon') migrate()
    }) as never)
    migrate()
    return () => { disposed = true; unsubscribe() }
  }, 'dsh-mnemon: canonical displayMode migration')
  ctx.effect(() => {
    let disposed = false
    const loader = ctx.get('loader') as { await?(): Promise<unknown> } | undefined
    void Promise.resolve(loader?.await?.()).then(async () => {
      if (disposed) return
      const catalog = await memoryPlugins.catalog()
      if (disposed) return
      await hostSettings.importLegacy(catalog.entries.filter(entry => entry.roles.includes('source')).map(entry => entry.entryId))
    }).catch(error => { console.warn('dsh-mnemon: could not recover retained legacy settings', error) })
    return () => { disposed = true }
  }, 'dsh-mnemon: retained settings migration')
  const coordinator: MnemonSubagentCoordinator = new MnemonSubagentCoordinator(ctx.subagents, runtime, ctx, () => {
    const taskAgentModel = runtime.config.taskAgentModel
    if (taskAgentModel.mode !== 'fixed') return undefined
    const provider = taskAgentModel.provider?.trim()
    const model = taskAgentModel.model?.trim()
    if (provider === undefined || provider === '' || model === undefined || model === '') return undefined
    return { provider, model }
  }, () => runtime.config.runtimeMemory.maintenanceMaxTokens,
  (scope, signal, operation) => lifecycle.runRuntimeMaintenanceTask(scope, signal, operation), accounts)
  const lifecycle = new MnemonLifecycle(ctx, coordinator, runtime.config, runtime, accounts)
  const skills = new SkillEvolution({
    settings: () => accounts?.skillSettings() ?? skillSettings.get(),
    source: agent => skillsSourceFor(runtime, agent),
    runTask: (workspaceRoot, signal, operation) => lifecycle.runSkillTask(workspaceRoot, signal, operation),
    skillTask: (parent, label, prompt, schema, persona, signal) => coordinator.skillTask(parent, label, prompt, schema, persona, signal),
  })
  lifecycle.useSkillEvolution(skills)
  ctx.effect(() => {
    const stop = lifecycle.start()
    const stopBackup = accountSync?.start() ?? autoBackup!.start()
    return async () => {
      stopBackup()
      stop()
      skills.dispose()
      await coordinator.dispose()
      runtime.dispose()
    }
  }, 'dsh-mnemon.lifecycle-root()')
  registerTools(ctx, runtime, coordinator)
  registerCommands(ctx.commands, runtime, coordinator)
  registerGuidance(ctx, resolved)
  ctx.inject(['connection', 'webServer'], (webContext) => {
    // `inject` guarantees the service at runtime; retain the defensive guard
    // because HostContextShape also models profiles where it is absent.
    // Connection's RPC getter keeps its provider's injection scope. Carry
    // the explicitly injected server on our own Context so late registration
    // works without changing or restarting the shared Connection plugin.
    const scopedConnection = Context.is(webContext)
      ? webContext.extend({ webServer: webContext.get('webServer') }).connection
      : webContext.connection
    if (scopedConnection === undefined) return
    const managementAuthority = resolved.remoteAccess === 'trusted-host' ? 'trusted-host' : 'loopback'
    const connection = { rpc: {
      handle: (channel: string, handler: import('./dsh.ts').HostRpcHandler) =>
        scopedConnection.rpc.handle(channel, (endpoint, payload, signal, caller) => {
          const principal = caller === undefined ? undefined : scopedConnection.principalOfPeer === undefined
            ? caller : scopedConnection.principalOfPeer(caller)
          return (accounts?.handler(handler, channel) ?? handler)(endpoint, payload, signal, principal)
        }, { authority: managementAuthority }),
    } }
    // The Starter updates through DSH's own plugin manager and profile, so a packaged
    // app's bundled pnpm serves it where no pnpm is on PATH.
    const versions = new VersionUpdateManager({
      mnemonCliPath: () => runtime.config.cliPath,
      bundleInstaller: () => ctx.get('pluginManager') as DshBundleInstaller | undefined,
      runningProfile: () => {
        const profile = ctx.get('profileContext') as { dir?: unknown; packageManager?: unknown } | undefined
        return typeof profile?.dir === 'string' ? { dir: profile.dir, packageManager: profile.packageManager !== undefined } : undefined
      },
      pluginCommand: () => dshPluginCommand(ctx.get('profileContext')),
    })
    const rpc = registerRpc(connection, runtime, lifecycle, versions, () => { if (accountSync !== undefined) accountSync.refresh(); else autoBackup!.refresh() })
    const settings = registerSettingsRpc(connection, accounts?.settingsService(principal => runtime.reloadAccount(principal)) ?? hostSettings)
    const view = registerViewRpc(connection, runtime, extensions, memoryPlugins, lifecycle, pluginInstallation)
    if (Context.is(webContext)) {
      new MnemonRemoteService(webContext, {
        ...Object.fromEntries(Object.entries(rpc).map(([key, handler]) => [key, accounts?.handler(handler, key) ?? handler])) as typeof rpc,
        settings: accounts?.handler(settings, 'settings') ?? settings,
        view: accounts?.handler(view.read, 'view') ?? view.read,
        viewWrite: accounts?.handler(view.write, 'viewWrite') ?? view.write,
        management: managementAuthority === 'trusted-host',
      })
    }
  })
}
