import type { AcpLaunchSpec } from '../acp/launch/acp-launch-contract'
import { GENERIC_ACP_DIALECT } from '../acp/acp-dialects/acp-dialect'
import { inheritedHomeAccountBinding } from '../acp/launch/acp-account-binding'
import type { StructuredAgentSessionHistory } from '../native-chat/conversation-adoption/structured-agent-cli-conversations'

const THOR_SESSION_HISTORY: StructuredAgentSessionHistory = {
  // Thor's ACP session ID is the provider resume handle; Orca imports no Thor terminal history.
  rowAgents: [],
  rowSessionId: (link) => link.handle.nativeId,
  parseResumeArgs: () => null
}

export const THOR_LAUNCH_SPEC: AcpLaunchSpec = {
  agent: 'thor',
  command: 'thor',
  // Thor's ACP server fixes the persona to main and owns its model selection.
  args: () => ['acp'],
  env: {},
  dialect: GENERIC_ACP_DIALECT,
  loginCommand: [],
  // Preserve Thor's ordinary environment and ~/.thor configuration instead of inventing THOR_HOME.
  account: inheritedHomeAccountBinding(),
  installDirectories: () => [],
  modelDiscovery: {
    kind: 'unavailable',
    reason: "Thor's main persona controls its model"
  },
  transcriptImport: null,
  sessionHistory: THOR_SESSION_HISTORY,
  resumePreference: 'resume',
  // Thor's existing local-tool policy is YOLO; Orca neither answers nor governs those tools.
  approvalEnforcement: 'provider'
}
