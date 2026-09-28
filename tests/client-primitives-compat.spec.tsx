// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ClientConnectionHandle, ClientSettingsScope, Config } from '../src/host/protocol.ts'
import { MnemonWorkbench } from '../src/client/MnemonWorkbench.tsx'
import { MnemonSaveAction } from '../src/client/MnemonSaveAction.tsx'

const snapshot = { status: 'ready' as const, value: {}, writable: true, mode: 'host' as const }
const settingsScope = {
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  mutate: async () => {},
} satisfies ClientSettingsScope<Config>
const localeSnapshot = { active: 'en', locales: [], revision: 0 }
const localeRuntime = { getSnapshot: () => localeSnapshot, subscribe: () => () => {} }

afterEach(cleanup)

it('renders the overlay back button and conversation save action with the current Host primitives', async () => {
  const close = vi.fn()
  // Failed RPCs still leave the navigation and explicit save action available.
  const connection = { isLoopback: true, rpc: { call: vi.fn(async () => { throw new Error('Host unavailable') }) } } as ClientConnectionHandle
  await act(async () => {
    render(<>
      <MnemonWorkbench connection={connection} settingsScope={settingsScope} surface="sidebar" onClose={close} t={key => key} />
      <MnemonSaveAction messageId="message-1" connection={connection} settingsScope={settingsScope} localeRuntime={localeRuntime} t={key => key} />
    </>)
  })
  const back = screen.getByRole('button', { name: 'header.backToConversation' })
  expect(back.querySelector('svg')?.getAttribute('width')).toBe('14')
  fireEvent.click(back)
  expect(close).toHaveBeenCalledOnce()
  const save = screen.getByRole('button', { name: 'saveAction.button' })
  expect(save.querySelector('svg')?.getAttribute('width')).toBe('16')
  await act(async () => { fireEvent.click(save) })
  expect(screen.getByRole('dialog', { name: 'saveAction.title' })).toBeTruthy()
})
