import { describe, expect, it } from 'vitest'
import {
  ALL_TUI_AGENTS,
  tuiAgentDisplayName
} from '../../../../shared/agent-launch/catalog/tui-agent-display-names'
import { TUI_AGENT_CONFIG } from '../../../../shared/agent-launch/catalog/tui-agent-config'
import {
  KNOWN_TUI_AGENT_DETECTION_COMMANDS,
  resolveDetectedTuiAgentIds
} from '../../../../shared/agent-launch/catalog/tui-agent-detection-commands'
import { tuiAgentToAgentKind } from '../../../../shared/agent-status/identity/agent-kind'
import { buildAgentCatalogEntries } from './agent-catalog-entries'
import { primaryAgentCatalogEntries } from './agent-catalog-entries-primary'

describe('Thor agent catalog registration', () => {
  it('registers Thor as an exhaustive detected TUI agent with concrete identity', () => {
    expect(ALL_TUI_AGENTS).toContain('thor')
    expect(tuiAgentDisplayName('thor')).toBe('Thor')
    expect(TUI_AGENT_CONFIG.thor).toMatchObject({
      detectCmd: 'thor-agent',
      launchCmd: 'thor-agent',
      expectedProcess: 'thor-agent'
    })
    expect(KNOWN_TUI_AGENT_DETECTION_COMMANDS).toContainEqual({ id: 'thor', cmd: 'thor-agent' })
    expect(
      resolveDetectedTuiAgentIds(KNOWN_TUI_AGENT_DETECTION_COMMANDS, new Set(['thor']), 'darwin')
    ).not.toContain('thor')
    expect(
      resolveDetectedTuiAgentIds(
        KNOWN_TUI_AGENT_DETECTION_COMMANDS,
        new Set(['thor-agent']),
        'darwin'
      )
    ).toContain('thor')
    expect(tuiAgentToAgentKind('thor')).toBe('thor')
  })

  it('keeps every known TUI agent in one unique renderer catalog entry', () => {
    const catalog = buildAgentCatalogEntries()
    const ids = catalog.map(({ id }) => id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ids)).toEqual(new Set(ALL_TUI_AGENTS))
    expect(primaryAgentCatalogEntries()).toContainEqual(
      expect.objectContaining({
        id: 'thor',
        label: 'Thor',
        cmd: 'thor-agent',
        homepageUrl: 'https://github.com/azafred/thor'
      })
    )
  })
})
