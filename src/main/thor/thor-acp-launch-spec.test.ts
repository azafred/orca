import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GENERIC_ACP_DIALECT } from '../acp/acp-dialects/acp-dialect'
import { ACP_LAUNCH_SPECS, acpLaunchSpecFor } from '../acp/launch/acp-launch-registry'
import { setupAcpSession } from '../acp/protocol/acp-session-setup'
import {
  agentChatPermissionModes,
  chatAsksNoApprovals
} from '../../shared/agent-launch/permissions/agent-chat-permission-support'
import { structuredAgentRuntimeMetadata } from '../runtime/agent-session/installation/structured-agent-runtime-metadata'
import { createAcpStructuredLaunchResolver } from '../runtime/agent-session/launch/structured-agent-launch-composition.test-support'
import { agentSessionRecordFixture } from '../../shared/agent-session/lifecycle/records/agent-session-record.test-fixture'
import { THOR_LAUNCH_SPEC } from './thor-acp-launch-spec'

describe('Thor ACP registration', () => {
  it('launches the existing Thor persona through stable ACP without model or permission overrides', () => {
    expect(THOR_LAUNCH_SPEC.command).toBe('thor-agent')
    expect(
      THOR_LAUNCH_SPEC.args({ fullAccess: false, pluginDirs: ['/unused'], model: 'ignored' })
    ).toEqual(['acp'])
    expect(THOR_LAUNCH_SPEC.env).toEqual({})
    expect(THOR_LAUNCH_SPEC.dialect).toBe(GENERIC_ACP_DIALECT)
    expect(THOR_LAUNCH_SPEC.account.pin).toEqual({ accountHomeVariable: 'THOR_CLI_HOME' })
    expect(
      THOR_LAUNCH_SPEC.account.environment(
        { variable: 'THOR_CLI_HOME', path: '/accounts/thor' },
        { PATH: '/usr/bin', THOR_CLI_HOME: '/changed' }
      )
    ).toEqual({ PATH: '/usr/bin', THOR_CLI_HOME: '/accounts/thor' })
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
        accountHomeVariable: 'THOR_CLI_HOME',
        capabilities: { approvalEnforcement: 'provider' }
      }
    })
  })

  it('pins the configured Thor CLI home or defaults it to the user home', async () => {
    await expect(
      THOR_LAUNCH_SPEC.account.resolve({
        launchEnv: { THOR_CLI_HOME: '' },
        stateDirectory: '/orca-data'
      })
    ).resolves.toEqual({ variable: 'THOR_CLI_HOME', path: join(homedir(), '.thor') })
    await expect(
      THOR_LAUNCH_SPEC.account.resolve({
        launchEnv: { THOR_CLI_HOME: '/accounts/custom-thor' },
        stateDirectory: '/orca-data'
      })
    ).resolves.toEqual({ variable: 'THOR_CLI_HOME', path: '/accounts/custom-thor' })
  })

  it.each([
    ['new session', []],
    [
      'resumed session',
      [
        {
          linkId: 'thor-link',
          origin: 'created' as const,
          mintedAtFence: 7,
          observedAt: 1_000,
          handle: { transport: 'acp', agent: 'thor', nativeId: 'thor-session' }
        }
      ]
    ]
  ])(
    'launches a %s with its recorded Thor home despite environment changes',
    async (_name, chain) => {
      const record = {
        ...agentSessionRecordFixture(),
        provider: 'thor' as const,
        providerHandleChain: chain,
        accountHome: { variable: 'THOR_CLI_HOME', path: '/accounts/pinned-thor' }
      }
      const resolve = createAcpStructuredLaunchResolver(THOR_LAUNCH_SPEC, {
        store: { getRecord: () => record, pinLaunchDirectory: async () => record },
        savedSession: { hasProviderTurn: async () => false },
        resolveEnvironment: async () => ({
          HOME: '/home/person',
          PATH: '/usr/bin',
          THOR_CLI_HOME: '/accounts/changed-thor'
        }),
        resolveCommand: (command) => `/resolved/${command}`,
        inheritedEnv: {},
        dataDirectory: '/orca-data'
      })

      const launch = await resolve({
        identity: {
          sessionId: record.sessionId,
          workspaceId: record.location.workspaceId,
          hostId: record.location.executionHostId,
          agent: 'thor',
          providerHandle: chain.at(-1)?.handle ?? null
        }
      })

      expect(launch.command).toBe('/resolved/thor-agent')
      expect(launch.args).toEqual(['acp'])
      expect(launch.env.THOR_CLI_HOME).toBe('/accounts/pinned-thor')
      expect(launch.resume?.sessionId ?? null).toBe(chain.at(-1)?.handle.nativeId ?? null)
    }
  )

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
