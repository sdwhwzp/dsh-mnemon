import type { HostSettingsService } from '../../src/host/dsh.ts'

export function memorySettings(): HostSettingsService {
  const values = new Map<string, { base: object; user: Record<string, unknown>; revision: number; validate?: (value: never) => void }>()
  return {
    writable: true,
    register: (namespace, _schema, options) => {
      if (!values.has(namespace)) values.set(namespace, { base: options.base ?? {}, user: {}, revision: 0, ...(options.validate === undefined ? {} : { validate: options.validate }) })
      return { get: () => ({ ...values.get(namespace)!.base, ...values.get(namespace)!.user }) as never }
    },
    describe: () => [...values].map(([ns, value]) => ({ ns, ...value, value: { ...value.base, ...value.user }, applies: 'live' })),
    mutate: async (ns, ops, expected) => {
      const value = values.get(ns)!
      if (expected !== undefined && expected !== value.revision) throw new Error('settings revision conflict')
      const next = { ...value.user }
      for (const op of ops) {
        if (op.path.length !== 1) throw new Error('fixture accepts top-level edits')
        if (op.op === 'unset') delete next[op.path[0]!]
        else next[op.path[0]!] = op.value
      }
      value.validate?.({ ...value.base, ...next } as never)
      value.user = next
      value.revision++
    },
  }
}
