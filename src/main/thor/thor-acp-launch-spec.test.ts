import { describe, expect, it } from 'vitest'
import { GENERIC_ACP_DIALECT } from '../acp/acp-dialects/acp-dialect'
import { ACP_LAUNCH_SPECS, acpLaunchSpecFor } from '../acp/launch/acp-launch-registry'
import { setupAcpSession } from '../acp/protocol/acp-session-setup'
import {
  agentChatPermissionModes,
  chatAsksNoApprovals
} from '../../shared/agent-launch/permissions/agent-chat-permission-support'
import { structuredAgentRuntimeMetadata } from '../runtime/agent-session/installation/structured-agent-runtime-metadata'
import { THOR_LAUNCH_SPEC } from './thor-acp-launch-spec'

describe('Thor ACP registration', () => {
  it('launches the existing Thor persona through stable ACP without model or permission overrides', () => {
    expect(THOR_LAUNCH_SPEC.command).toBe('thor')
    expect(
      THOR_LAUNCH_SPEC.args({ fullAccess: false, pluginDirs: ['/unused'], model: 'ignored' })
    ).toEqual(['acp'])
    expect(THOR_LAUNCH_SPEC.env).toEqual({})
    expect(THOR_LAUNCH_SPEC.dialect).toBe(GENERIC_ACP_DIALECT)
    expect(THOR_LAUNCH_SPEC.account.pin).toEqual({ accountHomeVariable: 'HOME' })
    expect(
      THOR_LAUNCH_SPEC.account.environment(
        { variable: 'HOME', path: '/home/person' },
        { PATH: '/usr/bin' }
      )
    ).toEqual({ PATH: '/usr/bin' })
    expect(THOR_LAUNCH_SPEC.modelDiscovery).toMatchObject({ kind: 'unavailable' })
    expect(THOR_LAUNCH_SPEC.transcriptImport).toBeNull()
    expect(THOR_LAUNCH_SPEC.resumePreference).toBe('resume')
    expect(THOR_LAUNCH_SPEC.permissionModeConfig).toBeUndefined()
    expect(THOR_LAUNCH_SPEC.approvalEnforcement).toBe('provider')
  })

  it('is available through the data-driven ACP structured runtime without dropping existing agents', () => {
    expect(ACP_LAUNCH_SPECS.map(({ agent }) => agent)).toEqual([
      'grok',
      'opencode',
      'opencode2',
      'omp',
      'antigravity',
      'copilot',
      'kimi',
      'cursor',
      'hermes',
      'thor'
    ])
    expect(acpLaunchSpecFor('thor')).toBe(THOR_LAUNCH_SPEC)
    expect(structuredAgentRuntimeMetadata('thor')).toMatchObject({
      definition: {
        agent: 'thor',
        handleTransport: 'acp',
        accountHomeVariable: 'HOME',
        capabilities: { approvalEnforcement: 'provider' }
      }
    })
  })

  it('does not expose Orca permission choices for Thor local tools', () => {
    expect(chatAsksNoApprovals('thor')).toBe(true)
    expect(agentChatPermissionModes('thor')).toBeNull()
  })

  it('reattaches provider sessions with session/resume instead of session/load', async () => {
    const methods: string[] = []
    const started = await setupAcpSession(
      {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } }
      },
      {
        cwd: '/workspace',
        mcpServers: [],
        sessionId: 'thor-session',
        resumePreference: THOR_LAUNCH_SPEC.resumePreference
      },
      async (method, _params, schema) => {
        methods.push(method)
        return schema.parse({})
      }
    )

    expect(started.kind).toBe('resume')
    expect(methods).toEqual(['session/resume'])
  })
})
