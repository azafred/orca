import type { MemorySnapshot } from '../../../../../../shared/diagnostics/process-stats-types'
import { useAppStore } from '../../../../store/index'
import type { UnifiedProjectGroup } from '../workspace-attribution/resource-usage-merge-types'

export type ResourceOwnerUsage = { cpu: number; memory: number }

/** This machine's memory by who started it, so no single total reads as Orca's own usage. */
export type ResourceOwnerSplit = {
  orca: ResourceOwnerUsage
  agents: ResourceOwnerUsage
  yourProcesses: ResourceOwnerUsage
  otherApps: number
  free: number
  hostTotal: number
}

type OwnedSession = {
  paneKey: string | null
  cpu: number | null
  memory: number | null
  agentOwnership?: 'present' | 'absent' | 'unknown'
}

function splitSessionsByOwner(
  snapshot: MemorySnapshot,
  sessions: Iterable<OwnedSession>,
  agentPaneKeys: { has(paneKey: string): boolean }
): ResourceOwnerSplit {
  const agents = { cpu: 0, memory: 0 }
  const yourProcesses = { cpu: 0, memory: 0 }
  for (const session of sessions) {
    if (session.memory === null) {
      continue
    }
    const isAgent =
      session.agentOwnership === 'present' ||
      (session.paneKey !== null && agentPaneKeys.has(session.paneKey))
    const bucket = isAgent ? agents : yourProcesses
    bucket.cpu += session.cpu ?? 0
    bucket.memory += session.memory
  }
  const orca = { cpu: snapshot.app.cpu, memory: snapshot.app.memory }
  const { totalMemory: hostTotal, usedMemory, availableMemory } = snapshot.host
  const tracked = orca.memory + agents.memory + yourProcesses.memory
  return {
    orca,
    agents,
    yourProcesses,
    otherApps: Math.max(0, usedMemory - tracked),
    free: Math.max(0, availableMemory),
    hostTotal
  }
}

function* localSessions(repos: readonly UnifiedProjectGroup[]): Iterable<OwnedSession> {
  for (const repo of repos) {
    for (const worktree of repo.worktrees) {
      // Why: SSH and paired-server rows run on another machine, not in this machine's bar.
      if (!worktree.isRemote && worktree.hostLabel === undefined) {
        yield* worktree.sessions
      }
    }
  }
}

export function splitResourceUsageByOwner(
  snapshot: MemorySnapshot,
  repos: readonly UnifiedProjectGroup[],
  agentPaneKeys: { has(paneKey: string): boolean }
): ResourceOwnerSplit {
  return splitSessionsByOwner(snapshot, localSessions(repos), agentPaneKeys)
}

/** The local snapshot alone, for callers that have no daemon session list. */
export function splitSnapshotByOwner(
  snapshot: MemorySnapshot,
  agentPaneKeys: { has(paneKey: string): boolean }
): ResourceOwnerSplit {
  return splitSessionsByOwner(
    snapshot,
    snapshot.worktrees.flatMap((worktree) => worktree.sessions),
    agentPaneKeys
  )
}

export function readAgentPaneKeys(): { has(paneKey: string): boolean } {
  return useAppStore.getState().agentStatusByPaneKey
}
