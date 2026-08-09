import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ThreadListEntry } from "@bb/domain";
import { cn } from "@bb/shared-ui/lib/utils";
import { Link } from "react-router-dom";
import { useRouteState } from "@/hooks/useRouteState";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { getThreadRoutePath } from "@/lib/route-paths";
import { getThreadDisplayTitle } from "@/lib/thread-title";
import {
  hasActiveBackgroundAgentActivity,
  hasActiveBackgroundCommandActivity,
  hasActiveGoalActivity,
  hasActivePlanModeActivity,
  hasActiveWorkflowActivity,
  isUnreadDoneThread,
  isRuntimeBusyThread,
  resolveThreadListIndicator,
  type ThreadListIndicatorKind,
} from "@/lib/thread-activity";

const MAX_RECENT_AGENTS = 5;
const MIN_AGENT_PANEL_HEIGHT = 96;
const DEFAULT_AGENT_PANEL_HEIGHT = 192;
const MAX_AGENT_PANEL_HEIGHT = 480;
const AGENT_PANEL_RESIZE_STEP = 24;

type AgentSidebarShortStatus = "blocked" | "done" | "working";

export interface AgentSidebarStatus {
  label: string;
  shortLabel: AgentSidebarShortStatus;
}

export interface AgentSidebarItem {
  status: AgentSidebarStatus;
  thread: ThreadListEntry;
}

function getAllSidebarThreads(
  navigation: ReturnType<typeof useSidebarNavigation>["data"],
): ThreadListEntry[] {
  if (!navigation) {
    return [];
  }

  return [
    ...navigation.projects.flatMap((project) => project.threads),
    ...navigation.personalProject.threads,
  ];
}

function isVisibleAgentThread(thread: ThreadListEntry): boolean {
  return (
    thread.visibility !== "hidden" &&
    thread.archivedAt === null &&
    thread.deletedAt === null
  );
}

function isActiveAgentItem(item: AgentSidebarItem): boolean {
  return (
    item.thread.status === "active" ||
    item.thread.status === "starting" ||
    item.thread.status === "stopping" ||
    item.status.shortLabel === "working"
  );
}

const STATUS_COPY: Record<
  Exclude<ThreadListIndicatorKind, "none" | "unread-success" | "draft">,
  Pick<AgentSidebarStatus, "label" | "shortLabel">
> = {
  "unread-error": {
    label: "Stopped with an error",
    shortLabel: "blocked",
  },
  "waiting-for-input": {
    label: "Waiting for your input",
    shortLabel: "blocked",
  },
  "working-draft": {
    label: "Working on a draft",
    shortLabel: "working",
  },
  workflow: {
    label: "Running a workflow",
    shortLabel: "working",
  },
  "background-agent": {
    label: "Delegating to an agent",
    shortLabel: "working",
  },
  "background-command": {
    label: "Running a background command",
    shortLabel: "working",
  },
  "plan-mode": {
    label: "Planning next steps",
    shortLabel: "working",
  },
  goal: {
    label: "Working towards a goal",
    shortLabel: "working",
  },
  runtime: {
    label: "Working on your request",
    shortLabel: "working",
  },
};

export function getAgentSidebarStatus(
  thread: ThreadListEntry,
): AgentSidebarStatus {
  const indicator = resolveThreadListIndicator({
    hasPendingInteraction: thread.hasPendingInteraction,
    hasUnsubmittedDraft: false,
    hasUnreadError: thread.status === "error" && isUnreadDoneThread(thread),
    hasUnreadSuccess: false,
    isBackgroundAgentActive: hasActiveBackgroundAgentActivity(thread),
    isBackgroundCommandActive: hasActiveBackgroundCommandActivity(thread),
    isGoalActive: hasActiveGoalActivity(thread),
    isPlanModeActive: hasActivePlanModeActivity(thread),
    isRuntimeActive: isRuntimeBusyThread(thread),
    isWorkflowActive: hasActiveWorkflowActivity(thread),
  });

  if (
    indicator !== "none" &&
    indicator !== "unread-success" &&
    indicator !== "draft"
  ) {
    const status = STATUS_COPY[indicator];
    return status;
  }

  if (thread.status === "starting") {
    return {
      label: "Starting up",
      shortLabel: "working",
    };
  }

  if (thread.status === "stopping") {
    return {
      label: "Wrapping up",
      shortLabel: "working",
    };
  }

  if (thread.status === "active") {
    return {
      label: "Working on your request",
      shortLabel: "working",
    };
  }

  if (thread.status === "error") {
    return {
      label: "Stopped with an error",
      shortLabel: "blocked",
    };
  }

  return {
    label: "Done",
    shortLabel: "done",
  };
}

function compareRecentAgents(left: AgentSidebarItem, right: AgentSidebarItem) {
  const updatedAtDelta = right.thread.updatedAt - left.thread.updatedAt;
  return updatedAtDelta !== 0
    ? updatedAtDelta
    : right.thread.createdAt - left.thread.createdAt;
}

function compareActiveAgents(left: AgentSidebarItem, right: AgentSidebarItem) {
  const createdAtDelta = right.thread.createdAt - left.thread.createdAt;
  return createdAtDelta !== 0
    ? createdAtDelta
    : right.thread.updatedAt - left.thread.updatedAt;
}

export function getAgentSidebarItems(
  threads: readonly ThreadListEntry[],
): AgentSidebarItem[] {
  const visibleItems = threads.filter(isVisibleAgentThread).map((thread) => ({
    status: getAgentSidebarStatus(thread),
    thread,
  }));
  const activeItems = visibleItems
    .filter(isActiveAgentItem)
    .sort(compareActiveAgents);
  const activeThreadIds = new Set(activeItems.map((item) => item.thread.id));
  const recentItems = visibleItems
    .filter((item) => !activeThreadIds.has(item.thread.id))
    .sort(compareRecentAgents)
    .slice(0, MAX_RECENT_AGENTS);

  return [...activeItems, ...recentItems];
}

function getAgentProviderLabel(providerId: string): string {
  return providerId.replace(/^acp-/u, "").replace(/-code$/u, "");
}

function AgentStatusGlyph({
  shortLabel,
}: {
  shortLabel: AgentSidebarShortStatus;
}) {
  if (shortLabel === "blocked") {
    return (
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full border-2 border-destructive"
      />
    );
  }

  if (shortLabel === "done") {
    return (
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full bg-timeline-accent"
      />
    );
  }

  return null;
}

function AgentStatusScroller({
  label,
  shortLabel,
  textClassName,
}: {
  label: string;
  shortLabel: AgentSidebarShortStatus;
  textClassName: string;
}) {
  return (
    <span
      className={cn("agent-sidebar-status-scroller", textClassName)}
      title={`${label}. Hover to scroll`}
    >
      <span aria-hidden="true" className="agent-sidebar-status-track">
        <span className="agent-sidebar-status-marquee-segment">
          {shortLabel}
          <span className="agent-sidebar-status-marquee-detail">
            <span className="px-2 text-muted-foreground/50">·</span>
            {label}
          </span>
        </span>
        <span className="agent-sidebar-status-marquee-segment">
          {shortLabel}
          <span className="agent-sidebar-status-marquee-detail">
            <span className="px-2 text-muted-foreground/50">·</span>
            {label}
          </span>
        </span>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function AgentSidebarRow({
  item,
  onNavigate,
  selected,
}: {
  item: AgentSidebarItem;
  onNavigate?: () => void;
  selected: boolean;
}) {
  const title = getThreadDisplayTitle(item.thread);
  const shortLabel = item.status.shortLabel;
  const statusTextClassName =
    shortLabel === "blocked"
      ? "text-destructive"
      : shortLabel === "working"
        ? "text-warning-text"
        : "text-timeline-accent";

  return (
    <Link
      to={getThreadRoutePath({
        projectId: item.thread.projectId,
        threadId: item.thread.id,
      })}
      onClick={onNavigate}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "group/agent flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-sm leading-5 outline-none transition-colors",
        "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        selected && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center pt-0.5">
        <AgentStatusGlyph shortLabel={shortLabel} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 truncate font-medium" title={title}>
          {title}
        </span>
        <span className="flex min-w-0 items-center text-xs leading-4">
          <AgentStatusScroller
            label={item.status.label}
            shortLabel={shortLabel}
            textClassName={statusTextClassName}
          />
          <span className="shrink-0 px-1 text-muted-foreground/45">·</span>
          <span className="min-w-0 truncate text-muted-foreground/55">
            {getAgentProviderLabel(item.thread.providerId)}
          </span>
        </span>
      </span>
    </Link>
  );
}

export interface AgentSidebarPanelProps {
  onNavigate?: () => void;
}

interface AgentPanelResizeState {
  pointerId: number;
  startClientY: number;
  startHeight: number;
}

function clampAgentPanelHeight(height: number): number {
  return Math.min(
    MAX_AGENT_PANEL_HEIGHT,
    Math.max(MIN_AGENT_PANEL_HEIGHT, height),
  );
}

export function AgentSidebarPanel({ onNavigate }: AgentSidebarPanelProps) {
  const [panelHeight, setPanelHeight] = useState(DEFAULT_AGENT_PANEL_HEIGHT);
  const resizeStateRef = useRef<AgentPanelResizeState | null>(null);
  const { data } = useSidebarNavigation();
  const { threadId: selectedThreadId } = useRouteState();
  const threads = useMemo(() => getAllSidebarThreads(data), [data]);
  const agentCount = useMemo(
    () => threads.filter(isVisibleAgentThread).length,
    [threads],
  );
  const items = useMemo(() => getAgentSidebarItems(threads), [threads]);

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeight: panelHeight,
    };
    const hitTarget = event.currentTarget;
    const divider = hitTarget.parentElement;
    if (!(divider instanceof HTMLDivElement)) {
      resizeStateRef.current = null;
      return;
    }
    hitTarget.setPointerCapture(event.pointerId);
    divider.dataset.dragging = "true";

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (
        resizeState === null ||
        resizeState.pointerId !== moveEvent.pointerId
      ) {
        return;
      }

      setPanelHeight(
        clampAgentPanelHeight(
          resizeState.startHeight +
            resizeState.startClientY -
            moveEvent.clientY,
        ),
      );
    };

    let finished = false;
    const finishResize = (endEvent: globalThis.PointerEvent) => {
      if (finished) {
        return;
      }
      const resizeState = resizeStateRef.current;
      if (
        resizeState === null ||
        resizeState.pointerId !== endEvent.pointerId
      ) {
        return;
      }

      finished = true;
      hitTarget.removeEventListener("pointermove", handlePointerMove);
      hitTarget.removeEventListener("pointerup", handlePointerUp);
      hitTarget.removeEventListener("pointercancel", handlePointerCancel);
      delete divider.dataset.dragging;
      resizeStateRef.current = null;
    };
    const handlePointerUp = (upEvent: globalThis.PointerEvent) => {
      finishResize(upEvent);
    };
    const handlePointerCancel = (cancelEvent: globalThis.PointerEvent) => {
      finishResize(cancelEvent);
    };

    hitTarget.addEventListener("pointermove", handlePointerMove);
    hitTarget.addEventListener("pointerup", handlePointerUp);
    hitTarget.addEventListener("pointercancel", handlePointerCancel);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const resizeBy = (amount: number) => {
      event.preventDefault();
      setPanelHeight((current) => clampAgentPanelHeight(current + amount));
    };

    switch (event.key) {
      case "ArrowUp":
        resizeBy(AGENT_PANEL_RESIZE_STEP);
        break;
      case "ArrowDown":
        resizeBy(-AGENT_PANEL_RESIZE_STEP);
        break;
      case "PageUp":
        resizeBy(AGENT_PANEL_RESIZE_STEP * 4);
        break;
      case "PageDown":
        resizeBy(-AGENT_PANEL_RESIZE_STEP * 4);
        break;
      case "Home":
        event.preventDefault();
        setPanelHeight(MIN_AGENT_PANEL_HEIGHT);
        break;
      case "End":
        event.preventDefault();
        setPanelHeight(MAX_AGENT_PANEL_HEIGHT);
        break;
    }
  };

  return (
    <section
      aria-label="Agents"
      data-testid="agents-sidebar-panel"
      className="shrink-0 pt-1 group-data-[collapsible=icon]:hidden"
    >
      <div
        role="separator"
        aria-label="Resize agents panel"
        aria-orientation="horizontal"
        aria-valuemin={MIN_AGENT_PANEL_HEIGHT}
        aria-valuemax={MAX_AGENT_PANEL_HEIGHT}
        aria-valuenow={panelHeight}
        aria-valuetext={`${panelHeight} pixels`}
        data-testid="agents-sidebar-resize-handle"
        tabIndex={0}
        className={cn(
          "group/agent-resize relative -mx-2 mb-1 h-px shrink-0 cursor-row-resize bg-border-seam outline-none transition-colors",
          "hover:bg-ring/40 focus-visible:bg-ring/40 data-[dragging]:bg-ring/40",
        )}
        onKeyDown={handleResizeKeyDown}
      >
        <div
          aria-hidden="true"
          data-testid="agents-sidebar-resize-hit-target"
          className="absolute inset-x-0 -top-1.5 z-10 h-3 touch-none cursor-row-resize"
          onPointerDown={handleResizePointerDown}
        />
      </div>
      <div className="flex items-center justify-between px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
        <span>Agents</span>
        <span className="text-subtle-foreground">{agentCount}</span>
      </div>
      <div className="overflow-y-auto" style={{ height: `${panelHeight}px` }}>
        {items.length > 0 ? (
          items.map((item) => (
            <AgentSidebarRow
              key={item.thread.id}
              item={item}
              onNavigate={onNavigate}
              selected={item.thread.id === selectedThreadId}
            />
          ))
        ) : (
          <p className="px-1 text-xs text-subtle-foreground">
            No active agents yet.
          </p>
        )}
      </div>
    </section>
  );
}
