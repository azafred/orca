// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ContextMenu, ContextMenuTrigger } from './context-menu'
import { DropdownMenu, DropdownMenuTrigger } from './dropdown-menu'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Hidden workspaces keep their tab bars mounted, so every key press paid one listener per closed menu (#44076).
it('keeps one document keydown listener however many closed menus are mounted', () => {
  const live = new Set<EventListenerOrEventListenerObject>()
  const add = document.addEventListener.bind(document)
  const remove = document.removeEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown' && listener) {
      live.add(listener)
    }
    add(type, listener, options)
  })
  vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown' && listener) {
      live.delete(listener)
    }
    remove(type, listener, options)
  })

  const menus = render(
    <>
      {Array.from({ length: 40 }, (_, index) => (
        <DropdownMenu key={`dropdown-${index}`}>
          <DropdownMenuTrigger>open</DropdownMenuTrigger>
        </DropdownMenu>
      ))}
      {Array.from({ length: 40 }, (_, index) => (
        <ContextMenu key={`context-${index}`}>
          <ContextMenuTrigger>row</ContextMenuTrigger>
        </ContextMenu>
      ))}
    </>
  )
  expect(live.size).toBe(1)

  menus.unmount()
  expect(live.size).toBe(0)
})
