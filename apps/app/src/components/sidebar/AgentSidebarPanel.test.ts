import type { ThreadListEntry } from "@bb/domain";
import { describe, expect, it } from "vitest";
import {
  getAgentSidebarItems,
  getAgentSidebarStatus,
} from "./AgentSidebarPanel";

function createThread(
  overrides: Partial<ThreadListEntry> = {},
): ThreadListEntry {
  return {
    id: "thr_test",
    projectId: "proj_test",
    environmentId: null,
    providerId: "codex",
    title: "Thread",
    titleFallback: "Thread",
    sectionId: null,
    status: "idle",
    parentThreadId: null,
    sourceThreadId: null,
    originKind: null,
    originPluginId: null,
    visibility: "visible",
    childOrigin: null,
    archivedAt: null,
    pinnedAt: null,
    pinSortKey: null,
    deletedAt: null,
    lastReadAt: 0,
    latestAttentionAt: 1,
    createdAt: 1,
    updatedAt: 1,
    activity: {
      activeWorkflowCount: 0,
      activeBackgroundAgentCount: 0,
      activeBackgroundCommandCount: 0,
      activePlanModeCount: 0,
      activeGoalCount: 0,
    },
    hasPendingInteraction: false,
    environmentHostId: null,
    environmentName: null,
    environmentBranchName: null,
    environmentWorkspaceDisplayKind: "other",
    runtime: {
      displayStatus: "idle",
      hostReconnectGraceExpiresAt: null,
    },
    ...overrides,
  };
}

describe("AgentSidebarPanel", () => {
  it("puts active agents first and keeps the recent list bounded", () => {
    const active = createThread({
      id: "thr_active",
      createdAt: 10,
      status: "active",
      title: "Active agent",
    });
    const recent = Array.from({ length: 6 }, (_, index) =>
      createThread({
        id: `thr_recent_${index}`,
        title: `Recent agent ${index}`,
        updatedAt: 20 - index,
      }),
    );
    const hidden = createThread({
      id: "thr_hidden",
      visibility: "hidden",
      updatedAt: 100,
    });

    const items = getAgentSidebarItems([hidden, ...recent, active]);

    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({
      thread: { id: "thr_active" },
    });
    expect(items.slice(1).map((item) => item.thread.id)).toEqual([
      "thr_recent_0",
      "thr_recent_1",
      "thr_recent_2",
      "thr_recent_3",
      "thr_recent_4",
    ]);
    expect(items.some((item) => item.thread.id === "thr_hidden")).toBe(false);
  });

  it("describes the work signal that should appear below an agent title", () => {
    const workflowAgent = createThread({
      activity: {
        activeWorkflowCount: 1,
        activeBackgroundAgentCount: 0,
        activeBackgroundCommandCount: 0,
        activePlanModeCount: 0,
        activeGoalCount: 0,
      },
    });

    expect(getAgentSidebarStatus(workflowAgent)).toMatchObject({
      label: "Running a workflow",
      shortLabel: "working",
    });
  });

  it("uses a done status for completed agents", () => {
    expect(getAgentSidebarStatus(createThread())).toEqual({
      label: "Done",
      shortLabel: "done",
    });
  });
});
