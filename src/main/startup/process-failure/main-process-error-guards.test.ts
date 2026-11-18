import { afterEach, describe, expect, it, vi } from 'vitest'

const { recordDurableCrashBreadcrumbMock } = vi.hoisted(() => ({
  recordDurableCrashBreadcrumbMock: vi.fn()
}))

vi.mock('../../crash-reporting/breadcrumbs/durable-crash-breadcrumb', () => ({
  recordDurableCrashBreadcrumb: recordDurableCrashBreadcrumbMock
}))

import { installUncaughtPipeErrorGuard } from './main-process-error-guards'

const originalListeners = process.listeners('uncaughtException')

function installedHandler(): (error: unknown) => void {
  return process
    .listeners('uncaughtException')
    .find((listener) => !originalListeners.includes(listener)) as (error: unknown) => void
}

describe('installUncaughtPipeErrorGuard', () => {
  afterEach(() => {
    for (const listener of process.listeners('uncaughtException')) {
      if (!originalListeners.includes(listener)) {
        process.removeListener('uncaughtException', listener)
      }
    }
    recordDurableCrashBreadcrumbMock.mockReset()
  })

  it('crashes with a recorded breadcrumb instead of leaving the error to the modal handler', () => {
    const crash = vi.fn()
    installUncaughtPipeErrorGuard(crash)

    installedHandler()(new TypeError('boom'))

    expect(crash).toHaveBeenCalled()
    expect(recordDurableCrashBreadcrumbMock).toHaveBeenCalledWith(
      'main_uncaught_exception',
      expect.objectContaining({ errorName: 'TypeError', errorMessage: 'boom' }),
      'main_uncaught_exception'
    )
    expect(installedHandler()).toBeDefined()
  })

  it('keeps running after a broken pipe', () => {
    const crash = vi.fn()
    installUncaughtPipeErrorGuard(crash)

    installedHandler()(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))

    expect(crash).not.toHaveBeenCalled()
  })
})
