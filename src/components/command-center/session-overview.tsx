import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Keyboard, Languages, LogOut, Monitor, Moon, Plus, RotateCcw, Sun, X } from "lucide-react";
import { randomBetween, normalizeAngleDelta, stepAngleDegrees, randomNormal, distanceBetween } from "./session-math-utils";
import { getWalkerForwardVector, isAquaticWalkerSpecies, chaikinSmooth, buildSamplesFromAbsolutePoints, buildBezierSamplesFromAbsolutePoints } from "./session-walker-utils";
import { createViewportBounds, pickRandomEdgeStart, getNearestEdgeExitPoint, pickRandomInteriorPoint, pickDiagonalInteriorPoint } from "./session-viewport-utils";
import { getRandomTargetDurationMs, isSeparatedFromPoints, createBreakoutAnchor, buildRandomWalkPath, buildPrimaryLobsterWalkPath, buildCompanionLobsterWalkPath } from "./session-path-builder";
import {
  DropdownIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatShortcutForPlatform, isApplePlatform } from "@/lib/utils";
import { chooseCollisionRerouteTarget, findNearbyCollisionPairs } from "@/components/command-center/lobster-collision";
import { SelectionMenu } from "@/components/command-center/selection-menu";
import { lobsterWalkTuning, sampleLobsterCompanionCount, samplePufferPitchDegrees, shouldSpawnLobsterCompanions } from "@/components/command-center/lobster-walk-tuning";
import {
  getPufferEdgeResponse,
  resolveAquaticWalkDurationMs,
  resolvePufferPitchForVerticalEdge,
  resolveWalkerEndAtAfterReroute,
} from "@/components/command-center/session-overview-utils";
import { isOfflineStatus } from "@/features/session/status-display";
import { useI18n } from "@/lib/i18n";
import { getImSessionDisplayName, resolveImSessionType } from "@/features/session/im-session";
import dingtalkLogoMarkup from "@/assets/im-logos/im-logo-dingtalk.svg?raw";
import feishuLogoMarkup from "@/assets/im-logos/im-logo-feishu.svg?raw";
import wecomLogoMarkup from "@/assets/im-logos/im-logo-wecom.svg?raw";
import weixinLogoMarkup from "@/assets/im-logos/im-logo-weixin.svg?raw";
import { ContextUsageRing } from "./session-context-ring";
import { clamp } from "./session-math-utils";
import { BlockTooltipContent } from "./session-tooltip-content";

type SessionOverviewSession = {
  agentId?: string;
  auth?: string;
  contextMax?: number;
  contextUsed?: number;
  mode?: string;
  model?: string;
  selectedModel?: string;
  sessionKey?: string;
  sessionUser?: string;
  status?: string;
  thinkMode?: string;
  [key: string]: unknown;
};

type SessionSearchResult = {
  displaySessionUser?: string;
  preview?: string;
  sessionKey?: string;
  sessionUser?: string;
  title?: string;
  updatedLabel?: string;
};

type SessionOverviewProps = {
  accessLoggingOut?: boolean;
  accessMode?: string;
  availableAgents?: string[];
  availableImChannels?: Record<string, { enabled?: boolean; defaultAgentId?: string }> | null;
  availableModels?: string[];
  composerSendMode?: string;
  extraControls?: ReactNode;
  fastMode?: boolean;
  formatCompactK: (value: unknown) => string;
  layout?: string;
  model?: string;
  onAgentChange?: (agentId: string) => void;
  onAccessLogout?: () => Promise<unknown> | unknown;
  onFastModeChange?: (nextFastMode: boolean) => void;
  onModelChange?: (modelId: string) => void;
  onOpenImSession?: (channel: string) => Promise<unknown> | unknown;
  onLoadImChannels?: () => Promise<unknown> | unknown;
  onSearchSessions?: (term: string, options?: { channel?: string }) => Promise<SessionSearchResult[] | unknown> | unknown;
  onSelectSearchedSession?: (result: SessionSearchResult) => Promise<unknown> | unknown;
  onThinkModeChange?: (mode: string) => void;
  onThemeChange?: (theme: string) => void;
  openAgentIds?: string[];
  openSessionUsers?: string[];
  resolvedTheme?: string;
  runtimeFallbackReason?: string;
  runtimeReconnectAttempts?: number;
  runtimeSocketStatus?: string;
  runtimeTransport?: string;
  sessionOverviewPending?: boolean;
  session: SessionOverviewSession;
  theme?: string;
};

type StatusPillProps = {
  action?: ReactNode;
  children?: ReactNode;
  label: ReactNode;
  resolvedTheme?: string;
  tooltipContent?: ReactNode;
  value?: ReactNode;
  valueClassName?: string;
  valueNode?: ReactNode;
  valueStyle?: CSSProperties;
};

type SessionOverviewPoint = {
  x: number;
  y: number;
};

type SessionOverviewRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type SessionOverviewSample = {
  length: number;
  x: number;
  y: number;
};

type SessionOverviewWalkPath = {
  durationMs: number;
  samples: SessionOverviewSample[];
  totalLength: number;
};

type WalkerPosition = {
  centerX: number;
  centerY: number;
  currentLeft: number;
  currentTop: number;
  fontSize: number;
  emojiTransform: string;
  rotation: number;
  walker: any;
};

type SessionSearchDialogProps = {
  messages: ReturnType<typeof useI18n>["messages"];
  onClose?: () => void;
  onSearchSessions?: SessionOverviewProps["onSearchSessions"];
  onSelectSearchedSession?: SessionOverviewProps["onSelectSearchedSession"];
  open?: boolean;
  searchChannel?: string;
  searchMessages?: any;
};

type SelectStatusPillProps = {
  compact?: boolean;
  disabled?: boolean;
  emptyText?: ReactNode;
  getItemDescription?: (item: string) => ReactNode;
  getItemLabel?: (item: string) => ReactNode;
  hideLabel?: boolean;
  items?: string[];
  label: string;
  menuLabel?: string;
  onSelect?: (item: string) => void;
  resolvedTheme?: string;
  selectedValue?: string;
  tooltipContent?: ReactNode;
  triggerLabel?: string;
  value?: ReactNode;
  valueClassName?: string;
  valueStyle?: CSSProperties;
};

const OverviewTooltip = Tooltip as any;
const OverviewTooltipContent = TooltipContent as any;
const OverviewTooltipTrigger = TooltipTrigger as any;
const OverviewDropdownMenu = DropdownMenu as any;
const OverviewDropdownMenuTrigger = DropdownMenuTrigger as any;
const OverviewDropdownMenuContent = DropdownMenuContent as any;
const OverviewDropdownMenuLabel = DropdownMenuLabel as any;
const OverviewDropdownMenuSeparator = DropdownMenuSeparator as any;
const OverviewDropdownMenuCheckboxItem = DropdownMenuCheckboxItem as any;
const OverviewDropdownMenuItem = DropdownMenuItem as any;

const thinkModeOptions = ["off", "minimal", "low", "medium", "high", "xhigh", "adaptive"];
const LOBSTER_WALK_MARGIN = 32;
const LOBSTER_SPEED_PX_PER_SECOND = 150;
const LOBSTER_MIN_DURATION_MS = 5000;
const LOBSTER_MAX_DURATION_MS = 15000;
const CRAB_SPAWN_PROBABILITY = lobsterWalkTuning.crabSpawnProbability;
const OCTOPUS_SPAWN_PROBABILITY = lobsterWalkTuning.octopusSpawnProbability;
const PUFFER_SPAWN_PROBABILITY = lobsterWalkTuning.pufferSpawnProbability;
const FISH_SPAWN_PROBABILITY = lobsterWalkTuning.fishSpawnProbability;
const TROPICAL_FISH_SPAWN_PROBABILITY = lobsterWalkTuning.tropicalFishSpawnProbability;
const PUFFER_MAX_PITCH_DEGREES = lobsterWalkTuning.pufferMaxPitchDegrees;
const LOBSTER_OFFSCREEN_PADDING = 56;
const LOBSTER_COLLISION_DISTANCE_PX = 54;
const LOBSTER_REROUTE_COOLDOWN_MS = lobsterWalkTuning.rerouteCooldownMs;
const LOBSTER_COMPANION_MIN_FONT_SIZE_PX = 10;
const LOBSTER_COMPANION_MAX_FONT_SIZE_PX = 180;
const LOBSTER_COMPANION_MEAN_FONT_SIZE_PX = 72;
const LOBSTER_COMPANION_STD_DEV_FONT_SIZE_PX = 28;
const LOBSTER_MAX_FONT_SIZE_PX = lobsterWalkTuning.primaryFontSizePx;
const LOBSTER_MIN_RANDOM_POINT_COUNT = 5;
const LOBSTER_MAX_RANDOM_POINT_COUNT = 10;
const WALKER_TURN_STEP_DEGREES = 6;
const OCTOPUS_BREATH_SCALE = 0.1;
const OCTOPUS_WIDTH_SQUASH_SCALE = 0.1;
const OCTOPUS_BREATH_CYCLE_MS = 1500;
const IM_PLATFORM_LOGOS = {
  "dingtalk-connector": {
    markup: dingtalkLogoMarkup,
  },
  feishu: {
    markup: feishuLogoMarkup,
  },
  wecom: {
    markup: wecomLogoMarkup,
  },
  "openclaw-weixin": {
    markup: weixinLogoMarkup,
  },
};





function sampleCompanionFontSize() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomNormal(
      LOBSTER_COMPANION_MEAN_FONT_SIZE_PX,
      LOBSTER_COMPANION_STD_DEV_FONT_SIZE_PX,
    );
    if (candidate >= LOBSTER_COMPANION_MIN_FONT_SIZE_PX && candidate <= LOBSTER_COMPANION_MAX_FONT_SIZE_PX) {
      return candidate;
    }
  }

  return clamp(
    randomNormal(LOBSTER_COMPANION_MEAN_FONT_SIZE_PX, LOBSTER_COMPANION_STD_DEV_FONT_SIZE_PX),
    LOBSTER_COMPANION_MIN_FONT_SIZE_PX,
    LOBSTER_COMPANION_MAX_FONT_SIZE_PX,
  );
}













function SessionSearchDialog({
  messages,
  onClose,
  onSearchSessions,
  onSelectSearchedSession,
  open = false,
  searchChannel = "dingtalk-connector",
  searchMessages,
}: SessionSearchDialogProps) {
  const copy = searchMessages || messages.sessionOverview.sessionSearch;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [submittedTerm, setSubmittedTerm] = useState("");
  const [results, setResults] = useState<SessionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectingSessionUser, setSelectingSessionUser] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
    setSubmittedTerm("");
    setResults([]);
    setSearching(false);
    setSelectingSessionUser("");
    setErrorMessage("");
  }, [open, searchChannel]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    if (!onSearchSessions) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const nextTerm = String(searchTerm || "").trim();

    setSearching(true);
    setErrorMessage("");

    try {
      const nextResults = await onSearchSessions(nextTerm, { channel: searchChannel });
      if (requestId !== requestIdRef.current) {
        return;
      }

      setResults(Array.isArray(nextResults) ? nextResults : []);
      setSubmittedTerm(nextTerm);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setResults([]);
      setSubmittedTerm(nextTerm);
      setErrorMessage(error?.message || copy.error);
    } finally {
      if (requestId === requestIdRef.current) {
        setSearching(false);
      }
    }
  };

  const handleSelect = async (result: SessionSearchResult) => {
    if (!result?.sessionUser || !onSelectSearchedSession) {
      return;
    }

    setSelectingSessionUser(result.sessionUser);
    setErrorMessage("");

    try {
      await onSelectSearchedSession(result);
      onClose?.();
    } catch (error) {
      setErrorMessage(error?.message || copy.error);
    } finally {
      setSelectingSessionUser("");
    }
  };

  if (!open) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal((
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        className="flex max-h-[min(80vh,48rem)] w-full max-w-[40rem] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-lg font-semibold leading-7 text-foreground">
              {copy.title}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.description}
            </p>
          </div>
          <button
            type="button"
            aria-label={copy.close}
            onClick={() => onClose?.()}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-input bg-background text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-foreground">
            <span className="font-medium">{copy.searchLabel}</span>
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={copy.placeholder}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={searching || Boolean(selectingSessionUser)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? copy.searching : copy.search}
            </button>
          </div>
        </form>

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-rose-500/35 bg-rose-500/8 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-border/60 bg-background/40 p-2">
          {results.length ? (
            <div className="space-y-2">
              {results.map((result) => (
                <div key={result.sessionKey || result.sessionUser} className="rounded-xl border border-border/60 bg-background/80 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
                        {result.title || result.sessionUser}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {copy.updatedLabel}: {result.updatedLabel || messages.common.unknown}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={searching || Boolean(selectingSessionUser)}
                      onClick={() => handleSelect(result)}
                      className="inline-flex shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectingSessionUser === result.sessionUser
                        ? copy.switching
                        : copy.useResult}
                    </button>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    <span className="font-medium text-foreground">{copy.sessionUserLabel}: </span>
                    {result.displaySessionUser || result.sessionUser}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    <span className="font-medium text-foreground">{copy.previewLabel}: </span>
                    {result.preview || copy.noPreview}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg px-3 py-8 text-sm leading-6 text-muted-foreground">
              {submittedTerm
                ? copy.empty(submittedTerm)
                : copy.emptyPrompt}
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}






function buildOctopusWalkPath(
  originRect: SessionOverviewRect,
  startPoint: SessionOverviewPoint,
  avoidPoints: SessionOverviewPoint[] = [],
  targetDurationMs: number | null = null,
): SessionOverviewWalkPath {
  const bounds = createViewportBounds(originRect);
  const desiredDurationMs = targetDurationMs ?? getRandomTargetDurationMs();
  const targetDistance = (LOBSTER_SPEED_PX_PER_SECOND * desiredDurationMs) / 1000;
  const minimumClearance = Math.max(originRect.width, originRect.height) * 1.4;
  let bestPath: SessionOverviewWalkPath | null = null;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const endPoint = pickDiagonalInteriorPoint(startPoint, originRect);
    const midpoint = {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    };
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const arcHeight = randomBetween(72, 180);
    const controlPoint = {
      x: clamp(midpoint.x + (normal.x * arcHeight), bounds.minLeft, bounds.maxLeft),
      y: clamp(midpoint.y + (normal.y * arcHeight), bounds.minTop, bounds.maxTop),
    };

    if (!isSeparatedFromPoints(controlPoint, avoidPoints, minimumClearance * 0.75)) {
      continue;
    }

    const samples = buildBezierSamplesFromAbsolutePoints(startPoint, controlPoint, endPoint, 72);
    const totalLength = samples.at(-1)?.length || 0;
    const candidatePath = {
      durationMs: (totalLength / LOBSTER_SPEED_PX_PER_SECOND) * 1000,
      samples,
      totalLength,
    };

    if (!bestPath || Math.abs(candidatePath.totalLength - targetDistance) < Math.abs(bestPath.totalLength - targetDistance)) {
      bestPath = candidatePath;
    }
  }

  if (bestPath) {
    return bestPath;
  }

  const fallbackEndPoint = pickDiagonalInteriorPoint(startPoint, originRect);
  const fallbackControlPoint = {
    x: clamp((startPoint.x + fallbackEndPoint.x) / 2, bounds.minLeft, bounds.maxLeft),
    y: clamp(((startPoint.y + fallbackEndPoint.y) / 2) - 96, bounds.minTop, bounds.maxTop),
  };
  const fallbackSamples = buildBezierSamplesFromAbsolutePoints(startPoint, fallbackControlPoint, fallbackEndPoint, 72);
  const fallbackLength = fallbackSamples.at(-1)?.length || 0;
  return {
    durationMs: (fallbackLength / LOBSTER_SPEED_PX_PER_SECOND) * 1000,
    samples: fallbackSamples,
    totalLength: fallbackLength,
  };
}

function pickPufferStartPoint(originRect: SessionOverviewRect, mirrored = false, pitchDegrees = 0): SessionOverviewPoint {
  const bounds = createViewportBounds(originRect);
  const viewportWidth = window.innerWidth;
  const startX = mirrored ? -originRect.width - LOBSTER_OFFSCREEN_PADDING : viewportWidth + LOBSTER_OFFSCREEN_PADDING;
  const endX = mirrored ? viewportWidth + LOBSTER_OFFSCREEN_PADDING : -originRect.width - LOBSTER_OFFSCREEN_PADDING;
  const horizontalDistance = Math.abs(endX - startX);
  const verticalOffset = Math.tan((clamp(pitchDegrees, -PUFFER_MAX_PITCH_DEGREES, PUFFER_MAX_PITCH_DEGREES) * Math.PI) / 180) * horizontalDistance;
  const minStartY = Math.min(Math.max(bounds.minTop - Math.min(0, verticalOffset), bounds.minTop), bounds.maxTop);
  const maxStartY = Math.max(Math.min(bounds.maxTop - Math.max(0, verticalOffset), bounds.maxTop), minStartY);

  return {
    x: startX,
    y: randomBetween(minStartY, maxStartY),
  };
}

function buildPufferWalkPath(
  originRect: SessionOverviewRect,
  startPoint: SessionOverviewPoint,
  mirrored = false,
  pitchDegrees = samplePufferPitchDegrees(),
): SessionOverviewWalkPath {
  const bounds = createViewportBounds(originRect);
  const viewportWidth = window.innerWidth;
  const normalizedPitch = clamp(pitchDegrees, -PUFFER_MAX_PITCH_DEGREES, PUFFER_MAX_PITCH_DEGREES);
  const endX = mirrored ? viewportWidth + LOBSTER_OFFSCREEN_PADDING : -originRect.width - LOBSTER_OFFSCREEN_PADDING;
  const horizontalDistance = Math.abs(endX - startPoint.x);
  const verticalOffset = Math.tan((normalizedPitch * Math.PI) / 180) * horizontalDistance;
  const endPoint = {
    x: endX,
    y: clamp(startPoint.y + verticalOffset, bounds.minTop, bounds.maxTop),
  };
  const samples = buildSamplesFromAbsolutePoints([startPoint, endPoint], startPoint);
  const totalLength = samples.at(-1)?.length || 0;

  return {
    durationMs: resolveAquaticWalkDurationMs(totalLength),
    samples,
    totalLength,
  };
}

function getPointAtDistance(samples, targetDistance) {
  if (!samples.length) {
    return { dx: 0, dy: -1, x: 0, y: 0 };
  }

  if (targetDistance <= 0) {
    const next = samples[1] || samples[0];
    return { dx: next.x - samples[0].x, dy: next.y - samples[0].y, x: samples[0].x, y: samples[0].y };
  }

  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index];
    if (targetDistance <= current.length) {
      const previous = samples[index - 1];
      const segmentLength = current.length - previous.length || 1;
      const segmentProgress = (targetDistance - previous.length) / segmentLength;
      return {
        dx: current.x - previous.x,
        dy: current.y - previous.y,
        x: previous.x + ((current.x - previous.x) * segmentProgress),
        y: previous.y + ((current.y - previous.y) * segmentProgress),
      };
    }
  }

  const last = samples.at(-1);
  const previous = samples.at(-2) || last;
  return { dx: last.x - previous.x, dy: last.y - previous.y, x: last.x, y: last.y };
}

function getWalkerTransform(point, walker) {
  if (walker?.species === "octopus") {
    const breathProgress = ((walker.breathTimeMs || 0) % OCTOPUS_BREATH_CYCLE_MS) / OCTOPUS_BREATH_CYCLE_MS;
    const breathWave = Math.sin(breathProgress * Math.PI * 2);
    const breathScale = 1 + (breathWave * OCTOPUS_BREATH_SCALE);
    const widthSquash = 1 - ((((breathWave + 1) / 2)) * OCTOPUS_WIDTH_SQUASH_SCALE);
    return {
      emojiTransform: `scale(${breathScale}) scaleX(${widthSquash})`,
      motionRotation: 0,
    };
  }

  if (walker?.species === "crab") {
    const dx = Math.abs(point.dx) > 0.01 ? point.dx : Math.cos(((walker.motionAngle || 0) * Math.PI) / 180);
    const dy = Math.abs(point.dy) > 0.01 ? point.dy : Math.sin(((walker.motionAngle || 0) * Math.PI) / 180);
    const targetAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    const motionAngle = stepAngleDegrees(walker.motionAngle, targetAngle);
    walker.motionAngle = motionAngle;
    return {
      emojiTransform: "scaleX(1.08) scaleY(0.92)",
      motionRotation: motionAngle,
    };
  }

  if (isAquaticWalkerSpecies(walker?.species)) {
    const dx = Math.abs(point.dx) > 0.01 ? point.dx : (walker.mirrored ? 1 : -1);
    const dy = Math.abs(point.dy) > 0.01 ? point.dy : 0;
    const targetPitch = clamp(
      Math.atan2(dy, Math.max(Math.abs(dx), 0.01)) * (180 / Math.PI),
      -PUFFER_MAX_PITCH_DEGREES,
      PUFFER_MAX_PITCH_DEGREES,
    );
    const motionAngle = stepAngleDegrees(walker.motionAngle, targetPitch);
    walker.motionAngle = motionAngle;
    return {
      emojiTransform: walker.mirrored ? "scaleX(-1)" : "",
      motionRotation: motionAngle,
    };
  }

  const dx = Math.abs(point.dx) > 0.01 ? point.dx : Math.cos((((walker.motionAngle || 0) - 90) * Math.PI) / 180);
  const dy = Math.abs(point.dy) > 0.01 ? point.dy : Math.sin((((walker.motionAngle || 0) - 90) * Math.PI) / 180);
  const targetAngle = Math.atan2(dy || -1, dx || 0) * (180 / Math.PI) + 90;
  const motionAngle = stepAngleDegrees(walker.motionAngle, targetAngle);
  walker.motionAngle = motionAngle;
  return {
    emojiTransform: "",
    motionRotation: motionAngle,
  };
}

function interpolateLobsterFrame(progress, walkPath, walker) {
  const distance = walkPath.totalLength * clamp(progress, 0, 1);
  const point = getPointAtDistance(walkPath.samples, distance);
  const transform = getWalkerTransform(point, walker);

  return {
    dx: point.dx,
    dy: point.dy,
    emojiTransform: transform.emojiTransform,
    rotation: transform.motionRotation,
    x: point.x,
    y: point.y,
  };
}

function createWalkerId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPrimaryWalker(originRect: SessionOverviewRect, avoidPoints: SessionOverviewPoint[] = []) {
  const startPoint = { x: originRect.left, y: originRect.top };
  const path = buildPrimaryLobsterWalkPath(originRect, startPoint, startPoint, avoidPoints);
  return {
    animationStartedAt: 0,
    emoji: "🦞",
    fontSize: LOBSTER_MAX_FONT_SIZE_PX,
    height: originRect.height,
    homePoint: startPoint,
    id: createWalkerId("main-lobster"),
    left: startPoint.x,
    motionAngle: 0,
    path,
    species: "lobster",
    startedAt: 0,
    top: startPoint.y,
    totalDurationMs: path.durationMs,
    type: "primary",
    width: originRect.width,
  };
}

function createEdgeWalker(
  originRect: SessionOverviewRect,
  avoidPoints: SessionOverviewPoint[] = [],
  emoji = "🦞",
  idPrefix = "companion-lobster",
  species = "lobster",
) {
  const startPoint = species === "octopus" ? pickRandomInteriorPoint(originRect) : pickRandomEdgeStart(originRect);
  const path = species === "octopus"
    ? buildOctopusWalkPath(originRect, startPoint, avoidPoints)
    : buildCompanionLobsterWalkPath(originRect, startPoint, avoidPoints, null, species);
  const fontSize = sampleCompanionFontSize();
  return {
    animationStartedAt: 0,
    breathTimeMs: 0,
    emoji,
    fontSize,
    height: originRect.height,
    id: createWalkerId(idPrefix),
    left: startPoint.x,
    motionAngle: 0,
    path,
    species,
    startedAt: 0,
    top: startPoint.y,
    totalDurationMs: path.durationMs,
    type: "companion",
    width: originRect.width,
  };
}

function createCompanionWalker(originRect: SessionOverviewRect, avoidPoints: SessionOverviewPoint[] = []) {
  return createEdgeWalker(originRect, avoidPoints, "🦞", "companion-lobster", "lobster");
}

function createCrabWalker(originRect: SessionOverviewRect, avoidPoints: SessionOverviewPoint[] = []) {
  return createEdgeWalker(originRect, avoidPoints, "🦀", "companion-crab", "crab");
}

function createOctopusWalker(originRect: SessionOverviewRect, avoidPoints: SessionOverviewPoint[] = []) {
  return createEdgeWalker(originRect, avoidPoints, "🐙", "companion-octopus", "octopus");
}

function createAquaticWalker(
  originRect: SessionOverviewRect,
  avoidPoints: SessionOverviewPoint[] = [],
  emoji = "🐡",
  idPrefix = "companion-puffer",
  species = "puffer",
) {
  const mirrored = Math.random() < 0.5;
  const pitchDegrees = samplePufferPitchDegrees();
  const minimumClearance = Math.max(originRect.width, originRect.height) * 1.25;
  let startPoint = pickPufferStartPoint(originRect, mirrored, pitchDegrees);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (isSeparatedFromPoints(startPoint, avoidPoints, minimumClearance)) {
      break;
    }
    startPoint = pickPufferStartPoint(originRect, mirrored, pitchDegrees);
  }

  const path = buildPufferWalkPath(originRect, startPoint, mirrored, pitchDegrees);
  const fontSize = sampleCompanionFontSize();

  return {
    animationStartedAt: 0,
    breathTimeMs: 0,
    emoji,
    fontSize,
    height: originRect.height,
    id: createWalkerId(idPrefix),
    left: startPoint.x,
    mirrored,
    motionAngle: pitchDegrees,
    path,
    species,
    startedAt: 0,
    top: startPoint.y,
    totalDurationMs: path.durationMs,
    type: "companion",
    width: originRect.width,
  };
}

function createPufferWalker(originRect: SessionOverviewRect, avoidPoints: SessionOverviewPoint[] = []) {
  return createAquaticWalker(originRect, avoidPoints, "🐡", "companion-puffer", "puffer");
}

function createFishWalker(originRect: SessionOverviewRect, avoidPoints: SessionOverviewPoint[] = []) {
  return createAquaticWalker(originRect, avoidPoints, "🐟", "companion-fish", "fish");
}

function createTropicalFishWalker(originRect: SessionOverviewRect, avoidPoints: SessionOverviewPoint[] = []) {
  return createAquaticWalker(originRect, avoidPoints, "🐠", "companion-tropical-fish", "tropical-fish");
}

function splitModeLabel(rawLabel = "") {
  const [value, description] = String(rawLabel || "").split(/\s+-\s+/, 2);
  return {
    value: value || rawLabel,
    description: description || value || rawLabel,
  };
}

function formatModelLabel(modelId = "") {
  return String(modelId || "").trim();
}

function getContextUsageColor(contextUsed, contextMax, resolvedTheme) {
  const ratio = contextMax > 0 ? (contextUsed / contextMax) : 0;

  if (resolvedTheme === "light") {
    if (ratio < 0.3) return "#0f9f6e";
    if (ratio < 0.6) return "#c77700";
    if (ratio < 0.9) return "#d92d20";
    return "#6d28d9";
  }

  if (ratio < 0.3) return "#34d399";
  if (ratio < 0.6) return "#fbbf24";
  if (ratio < 0.9) return "#f87171";
  return "#c4b5fd";
}

function getContextUsageRatio(contextUsed, contextMax) {
  if (!Number.isFinite(contextUsed) || !Number.isFinite(contextMax) || contextMax <= 0) {
    return 0;
  }

  return clamp(contextUsed / contextMax, 0, 1);
}

function SelectStatusPill({
  compact = false,
  disabled = false,
  emptyText,
  getItemDescription,
  getItemLabel,
  hideLabel = false,
  items,
  label,
  menuLabel,
  onSelect,
  selectedValue,
  triggerLabel,
  tooltipContent,
  value,
  valueClassName,
  valueStyle,
  resolvedTheme,
}: SelectStatusPillProps) {
  const isLightTheme = resolvedTheme === "light";
  return (
    <SelectionMenu
      disabled={disabled}
      label={menuLabel || label}
      triggerLabel={triggerLabel || menuLabel || label}
      items={items}
      value={selectedValue}
      onSelect={(item) => onSelect?.(String(item))}
      emptyText={emptyText}
      getItemLabel={getItemLabel}
      getItemDescription={getItemDescription}
      tooltipContent={tooltipContent}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={triggerLabel || menuLabel || label}
        className={cn(
          compact
            ? "inline-flex h-9 min-w-[8.5rem] items-center gap-2 rounded-md border px-2.5 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-55"
            : "inline-flex h-14 min-w-[88px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-55",
          compact
            ? "border-border/45 bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:border-border/70 hover:bg-muted/30 focus-visible:border-border/70 focus-visible:bg-muted/30 focus-visible:ring-border/50"
            : isLightTheme
              ? "border-border/70 bg-white hover:bg-accent/40 focus-visible:border-border focus-visible:bg-accent/30 focus-visible:ring-border/70"
              : "border-border/70 bg-background/80 hover:bg-accent/40 focus-visible:border-border focus-visible:bg-accent/30 focus-visible:ring-border/70",
        )}
      >
        <div className="min-w-0 flex-1">
          {hideLabel ? null : <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>}
          <div className={cn("truncate font-normal", compact ? "text-sm leading-none" : "text-sm", valueClassName)} style={valueStyle}>
            {value}
          </div>
        </div>
        <div className="shrink-0">
          <DropdownIcon />
        </div>
      </button>
    </SelectionMenu>
  );
}

function StatusPill({ label, value, valueNode, action, tooltipContent, valueClassName, valueStyle, children, resolvedTheme }: StatusPillProps) {
  const isLightTheme = resolvedTheme === "light";
  return (
    <OverviewTooltip>
      <OverviewTooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex h-14 min-w-[88px] items-center gap-2 rounded-lg border border-border/70 px-2.5 py-1.5",
            isLightTheme ? "bg-white" : "bg-background/80",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
            <div className={cn("truncate text-sm font-normal", valueClassName)} style={valueStyle}>
              {valueNode || value}
            </div>
          </div>
          {children ? <div className="shrink-0">{children}</div> : null}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </OverviewTooltipTrigger>
      {tooltipContent ? <OverviewTooltipContent side="bottom">{tooltipContent}</OverviewTooltipContent> : <BlockTooltipContent label={label} value={value} />}
    </OverviewTooltip>
  );
}

function ContextTooltipContent({ messages }) {
  return (
    <div className="max-w-[22rem] space-y-0.5">
      <div>{messages.sessionOverview.tooltips.contextTitle || messages.sessionOverview.tooltips.context}</div>
      <div className="text-[11px] leading-relaxed text-muted-foreground">
        {messages.sessionOverview.tooltips.contextDescriptionBefore}
        <RotateCcw aria-hidden="true" className="mx-0.5 inline-block h-[0.95em] w-[0.95em] align-[-0.08em]" />
        {messages.sessionOverview.tooltips.contextDescriptionAfter}
      </div>
    </div>
  );
}

function TransportTooltipContent({
  messages,
  runtimeFallbackReason = "",
  runtimeReconnectAttempts = 0,
  runtimeSocketLabel = "",
  runtimeTransportLabel = "",
}) {
  return (
    <div className="max-w-[22rem] space-y-1">
      <div>{messages.sessionOverview.tooltips.transport}</div>
      <div className="space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
        <div>{`${messages.sessionOverview.labels.transport}: ${runtimeTransportLabel}`}</div>
        <div>{`${messages.sessionOverview.labels.runtimeSocket}: ${runtimeSocketLabel}`}</div>
        {runtimeReconnectAttempts > 0 ? (
          <div>{`${messages.sessionOverview.labels.runtimeReconnectAttempts}: ${runtimeReconnectAttempts}`}</div>
        ) : null}
        {runtimeFallbackReason ? (
          <div className="break-words">{`${messages.sessionOverview.labels.runtimeFallbackReason}: ${runtimeFallbackReason}`}</div>
        ) : null}
      </div>
    </div>
  );
}

function ThemeToggle({ onChange, resolvedTheme, value }: { onChange?: (theme: string) => void; resolvedTheme?: string; value?: string }) {
  const { messages } = useI18n();
  const options = [
    {
      id: "system",
      icon: Monitor,
      label: messages.theme.system,
      description: messages.theme.descriptions.system,
      shortcutLabel: formatShortcutForPlatform(messages.theme.shortcuts.system),
    },
    {
      id: "light",
      icon: Sun,
      label: messages.theme.light,
      description: messages.theme.descriptions.light,
      shortcutLabel: formatShortcutForPlatform(messages.theme.shortcuts.light),
    },
    {
      id: "dark",
      icon: Moon,
      label: messages.theme.dark,
      description: messages.theme.descriptions.dark,
      shortcutLabel: formatShortcutForPlatform(messages.theme.shortcuts.dark),
    },
  ];

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center self-stretch rounded-full border p-0.5",
        resolvedTheme === "light"
          ? "border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
          : "border-border/70 bg-background/90",
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.id;
        return (
          <OverviewTooltip key={option.id}>
            <OverviewTooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange?.(option.id)}
                aria-label={option.label}
                className={cn(
                  "inline-flex h-8 min-w-[2.5rem] items-center justify-center self-center rounded-full border px-2 transition-[background-color,color,box-shadow,border-color] duration-200",
                  active
                    ? resolvedTheme === "light"
                      ? "border-transparent bg-slate-200 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                      : "border-transparent bg-slate-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : resolvedTheme === "light"
                      ? "border-transparent bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      : "border-transparent bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </OverviewTooltipTrigger>
            <OverviewTooltipContent side="bottom" className="px-2.5 py-2">
              <div className="space-y-0.5">
                <div>{option.label}</div>
                <div className="text-[11px] text-background/70">{option.description}</div>
                <div className="text-[11px] text-background/70">{messages.theme.shortcutHint(option.shortcutLabel)}</div>
              </div>
            </OverviewTooltipContent>
          </OverviewTooltip>
        );
      })}
    </div>
  );
}

function ShortcutHelpButton({ composerSendMode = "enter-send" }: { composerSendMode?: string }) {
  const { messages } = useI18n();
  const [open, setOpen] = useState(false);
  const helpShortcut = formatShortcutForPlatform("Cmd + /");
  const applePlatform = isApplePlatform();
  const composerShortcutLabels = composerSendMode === "double-enter-send"
    ? {
        sendMessage: messages.shortcuts.shortcuts.sendMessageDoubleEnterSend,
        insertNewline: messages.shortcuts.shortcuts.insertNewlineDoubleEnterSend,
      }
    : {
        sendMessage: messages.shortcuts.shortcuts.sendMessageEnterSend,
        insertNewline: messages.shortcuts.shortcuts.insertNewlineEnterSend,
      };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const normalizedKey = String(event.key || "").trim();
      const usesExpectedModifier = applePlatform
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      const isShortcutToggle =
        usesExpectedModifier
        && !event.shiftKey
        && !event.altKey
        && (event.code === "Slash" || normalizedKey === "/" || normalizedKey === "?");

      if (isShortcutToggle && !event.repeat && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
        return;
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [applePlatform]);

  const shortcutGroups = [
    {
      id: "global",
      title: messages.shortcuts.sections.global,
      items: [
        {
          id: "help",
          shortcut: formatShortcutForPlatform("Cmd + /"),
          description: messages.shortcuts.items.openHelp,
        },
        {
          id: "reset",
          shortcut: formatShortcutForPlatform("Cmd + N"),
          description: messages.shortcuts.items.resetConversation,
        },
        {
          id: "tab-number",
          shortcut: formatShortcutForPlatform("Cmd + 1-9"),
          description: messages.shortcuts.items.switchSessionByNumber,
        },
        {
          id: "tab-left",
          shortcut: formatShortcutForPlatform("Cmd + Left"),
          description: messages.shortcuts.items.previousSession,
        },
        {
          id: "tab-right",
          shortcut: formatShortcutForPlatform("Cmd + Right"),
          description: messages.shortcuts.items.nextSession,
        },
      ],
    },
    {
      id: "appearance",
      title: messages.shortcuts.sections.appearance,
      items: [
        {
          id: "theme-system",
          shortcut: formatShortcutForPlatform(messages.theme.shortcuts.system),
          description: messages.shortcuts.items.themeSystem,
        },
        {
          id: "theme-light",
          shortcut: formatShortcutForPlatform(messages.theme.shortcuts.light),
          description: messages.shortcuts.items.themeLight,
        },
        {
          id: "theme-dark",
          shortcut: formatShortcutForPlatform(messages.theme.shortcuts.dark),
          description: messages.shortcuts.items.themeDark,
        },
      ],
    },
    {
      id: "composer",
      title: messages.shortcuts.sections.composer,
      items: [
        {
          id: "send",
          shortcut: composerShortcutLabels.sendMessage,
          description: messages.shortcuts.items.sendMessage,
        },
        {
          id: "newline",
          shortcut: composerShortcutLabels.insertNewline,
          description: messages.shortcuts.items.insertNewline,
        },
        {
          id: "history-prev",
          shortcut: messages.shortcuts.shortcuts.previousPrompt,
          description: messages.shortcuts.items.previousPrompt,
        },
        {
          id: "history-next",
          shortcut: messages.shortcuts.shortcuts.nextPrompt,
          description: messages.shortcuts.items.nextPrompt,
        },
        {
          id: "voice-input",
          shortcut: formatShortcutForPlatform("Cmd + Shift + ."),
          description: messages.shortcuts.items.voiceInputToggle,
        },
      ],
    },
    {
      id: "preview",
      title: messages.inspector.previewActions.previewTitle,
      items: [
        {
          id: "preview-edit",
          shortcut: "E",
          description: messages.inspector.previewActions.editFile,
        },
        {
          id: "preview-save",
          shortcut: formatShortcutForPlatform("Cmd + S"),
          description: messages.inspector.previewActions.saveFile,
        },
        {
          id: "preview-zoom-in",
          shortcut: "=/+",
          description: messages.shortcuts.items.previewZoomIn,
        },
        {
          id: "preview-zoom-out",
          shortcut: "-",
          description: messages.shortcuts.items.previewZoomOut,
        },
        {
          id: "preview-zoom-reset",
          shortcut: "0",
          description: messages.shortcuts.items.previewResetZoom,
        },
        {
          id: "preview-reveal",
          shortcut: "O",
          description: messages.shortcuts.items.previewRevealInFileManager,
        },
        {
          id: "preview-rotate-left",
          shortcut: "Q",
          description: messages.shortcuts.items.previewRotateLeft,
        },
        {
          id: "preview-rotate-right",
          shortcut: "W",
          description: messages.shortcuts.items.previewRotateRight,
        },
        {
          id: "preview-close",
          shortcut: "Esc",
          description: messages.common.closePreview,
        },
      ],
    },
    {
      id: "dialog",
      title: messages.shortcuts.sections.dialog,
      items: [
        {
          id: "close-dialog",
          shortcut: "Esc",
          description: messages.shortcuts.items.closeDialog,
        },
      ],
    },
  ];

  return (
    <>
      <OverviewTooltip>
        <OverviewTooltipTrigger asChild>
          <button
            type="button"
            aria-label={messages.shortcuts.tooltipTitle}
            onClick={() => setOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center self-stretch rounded-full border border-border/70 bg-background/90 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
          >
            <Keyboard className="h-4 w-4" />
          </button>
        </OverviewTooltipTrigger>
        <OverviewTooltipContent side="bottom" className="px-2.5 py-2">
          <div className="space-y-0.5">
            <div>{messages.shortcuts.tooltipTitle}</div>
            <div className="text-[11px] text-background/70">{helpShortcut}</div>
          </div>
        </OverviewTooltipContent>
      </OverviewTooltip>

      {open ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-background/68 px-4 py-6 backdrop-blur-[6px]"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={messages.shortcuts.dialogTitle}
            className="w-full max-w-3xl rounded-[1.5rem] border border-border/70 bg-background/96 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-lg font-semibold tracking-[-0.02em] text-foreground">{messages.shortcuts.dialogTitle}</div>
                <div className="text-sm text-muted-foreground">{messages.shortcuts.dialogDescription}</div>
              </div>
              <button
                type="button"
                aria-label={messages.shortcuts.close}
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {shortcutGroups.map((group) => (
                <section key={group.id} className="rounded-2xl border border-border/60 bg-card/70 p-4">
                  <div className="mb-3 text-sm font-semibold text-foreground">{group.title}</div>
                  <div className="space-y-2.5">
                    {group.items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 text-sm leading-6 text-foreground">{item.description}</div>
                        <kbd className="shrink-0 rounded-lg border border-border/70 bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          {item.shortcut}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LanguageToggle() {
  const { locale, localeOptions, messages, setLocale } = useI18n();
  const activeLocale = localeOptions.find((option) => option.value === locale);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleTooltipOpenChange = useCallback((nextOpen) => {
    if (tooltipSuppressed || menuOpen) {
      setTooltipOpen(false);
      return;
    }
    setTooltipOpen(nextOpen);
  }, [menuOpen, tooltipSuppressed]);

  const dismissTooltip = useCallback(() => {
    setTooltipSuppressed(true);
    setTooltipOpen(false);
  }, []);

  const handleMenuOpenChange = useCallback((nextOpen) => {
    setMenuOpen(nextOpen);
    if (nextOpen) {
      dismissTooltip();
    }
  }, [dismissTooltip]);

  const handlePointerLeave = useCallback(() => {
    setTooltipSuppressed(false);
  }, []);

  const handleLocaleChange = useCallback((nextLocale) => {
    dismissTooltip();
    (setLocale as any)(nextLocale);
  }, [dismissTooltip, setLocale]);

  return (
    <OverviewDropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
      <OverviewTooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <OverviewTooltipTrigger asChild>
          <OverviewDropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={messages.locale.switchLabel}
              onPointerDown={dismissTooltip}
              onPointerLeave={handlePointerLeave}
              className="inline-flex h-9 items-center self-stretch gap-2 rounded-full border border-border/70 bg-background/90 px-3 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
            >
              <Languages className="h-4 w-4" />
              <span className="text-xs font-medium text-foreground">{activeLocale?.label || locale.toUpperCase()}</span>
            </button>
          </OverviewDropdownMenuTrigger>
        </OverviewTooltipTrigger>
        <OverviewTooltipContent side="bottom">{messages.locale.switchLabel}</OverviewTooltipContent>
      </OverviewTooltip>
      <OverviewDropdownMenuContent align="end">
        <OverviewDropdownMenuLabel>{messages.locale.label}</OverviewDropdownMenuLabel>
        <OverviewDropdownMenuSeparator />
        {localeOptions.map((option) => (
          <OverviewDropdownMenuCheckboxItem
            key={option.value}
            checked={option.value === locale}
            onCheckedChange={() => handleLocaleChange(option.value)}
          >
            {option.label}
          </OverviewDropdownMenuCheckboxItem>
        ))}
      </OverviewDropdownMenuContent>
    </OverviewDropdownMenu>
  );
}

function AccessLogoutButton({ loggingOut = false, onLogout }: { loggingOut?: boolean; onLogout?: () => Promise<unknown> | unknown }) {
  const { messages } = useI18n();
  const handleClick = useCallback(async () => {
    try {
      await onLogout?.();
    } catch {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(messages.authGate.errors.logout);
      }
    }
  }, [messages.authGate.errors.logout, onLogout]);

  return (
    <OverviewTooltip>
      <OverviewTooltipTrigger asChild>
        <button
          type="button"
          aria-label={loggingOut ? messages.common.loggingOut : messages.common.logOut}
          onClick={handleClick}
          disabled={loggingOut}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground transition hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </OverviewTooltipTrigger>
      <OverviewTooltipContent side="bottom">
        {loggingOut ? messages.common.loggingOut : messages.common.logOutTooltip}
      </OverviewTooltipContent>
    </OverviewTooltip>
  );
}

function LobsterBrand({ compact = false, subtitle = "" }: { compact?: boolean; subtitle?: ReactNode }) {
  const { messages } = useI18n();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const activeWalkersRef = useRef<any[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const walkerContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const walkerEmojiRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const walkerMotionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeWalkers, setActiveWalkers] = useState<any[]>([]);

  const setWalkerContainerRef = (id) => (node) => {
    if (node) {
      walkerContainerRefs.current[id] = node;
      return;
    }
    delete walkerContainerRefs.current[id];
  };

  const setWalkerMotionRef = (id) => (node) => {
    if (node) {
      walkerMotionRefs.current[id] = node;
      return;
    }
    delete walkerMotionRefs.current[id];
  };

  const setWalkerEmojiRef = (id) => (node) => {
    if (node) {
      walkerEmojiRefs.current[id] = node;
      return;
    }
    delete walkerEmojiRefs.current[id];
  };

  useEffect(() => () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  useEffect(() => {
    activeWalkersRef.current = activeWalkers;
  }, [activeWalkers]);

  useEffect(() => {
    if (!activeWalkers.length || typeof window === "undefined") {
      return undefined;
    }

    const rerouteWalker = (
      walker,
      currentLeft,
      currentTop,
      currentRotation,
      currentEmojiTransform,
      avoidPoints,
      now,
      { pufferPitchOverride = null, togglePufferMirror = false }: { pufferPitchOverride?: number | null; togglePufferMirror?: boolean } = {},
    ) => {
      const currentRect = {
        height: walker.height,
        left: currentLeft,
        top: currentTop,
        width: walker.width,
      };
      const startPoint = { x: currentLeft, y: currentTop };
      const remainingDurationMs = Math.max(180, walker.endAt - now);
      const nextPufferMirrored = togglePufferMirror ? !walker.mirrored : walker.mirrored;
      const nextPufferPitch = Number.isFinite(pufferPitchOverride)
        ? pufferPitchOverride
        : togglePufferMirror
          ? samplePufferPitchDegrees()
          : currentRotation;
      const nextPath = walker.type === "primary"
        ? buildPrimaryLobsterWalkPath(currentRect, startPoint, walker.homePoint, avoidPoints, remainingDurationMs, currentRotation)
        : walker.species === "octopus"
          ? buildOctopusWalkPath(currentRect, startPoint, avoidPoints, remainingDurationMs)
          : isAquaticWalkerSpecies(walker.species)
            ? buildPufferWalkPath(currentRect, startPoint, nextPufferMirrored, nextPufferPitch)
          : buildCompanionLobsterWalkPath(currentRect, startPoint, avoidPoints, remainingDurationMs, walker.species, currentRotation);

      walker.left = currentLeft;
      walker.motionAngle = isAquaticWalkerSpecies(walker.species) ? nextPufferPitch : currentRotation;
      walker.path = nextPath;
      walker.startedAt = now;
      walker.top = currentTop;
      walker.endAt = resolveWalkerEndAtAfterReroute({
        currentEndAt: walker.endAt,
        fallbackDurationMs: nextPath.durationMs,
        fallbackStartedAt: now,
      });
      walker.lastRerouteAt = now;
      if (isAquaticWalkerSpecies(walker.species)) {
        walker.mirrored = nextPufferMirrored;
      }

      const containerNode = walkerContainerRefs.current[walker.id];
      if (containerNode) {
        containerNode.style.left = `${currentLeft}px`;
        containerNode.style.top = `${currentTop}px`;
      }

      const motionNode = walkerMotionRefs.current[walker.id];
      if (motionNode) {
        motionNode.style.transform = `translate3d(0px, 0px, 0) rotate(${currentRotation}deg)`;
      }

      const emojiNode = walkerEmojiRefs.current[walker.id];
      if (emojiNode) {
        emojiNode.style.transform = currentEmojiTransform || "";
      }
    };

    const tick = (now) => {
      const currentWalkers = activeWalkersRef.current;
      const visibleWalkers: any[] = [];
      const positions: WalkerPosition[] = [];

      currentWalkers.forEach((walker) => {
        if (now >= walker.endAt) {
          return;
        }

        const progress = Math.min((now - walker.startedAt) / walker.path.durationMs, 1);
        if (progress >= 1) {
          return;
        }

        walker.breathTimeMs = now - walker.animationStartedAt;
        const frame = interpolateLobsterFrame(progress, walker.path, walker);
        const motionNode = walkerMotionRefs.current[walker.id];
        const emojiNode = walkerEmojiRefs.current[walker.id];

        if (motionNode) {
          motionNode.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0) rotate(${frame.rotation}deg)`;
        }

        if (emojiNode) {
          emojiNode.style.transform = frame.emojiTransform || "";
        }

        const currentLeft = walker.left + frame.x;
        const currentTop = walker.top + frame.y;
        const pufferEdgeResponse = isAquaticWalkerSpecies(walker.species)
          ? getPufferEdgeResponse({
              currentLeft,
              currentTop,
              dx: frame.dx,
              dy: frame.dy,
              height: walker.height,
              viewportHeight: window.innerHeight,
              viewportWidth: window.innerWidth,
              width: walker.width,
            })
          : null;

        if (pufferEdgeResponse?.type === "horizontal-flip") {
          rerouteWalker(
            walker,
            currentLeft,
            currentTop,
            frame.rotation,
            frame.emojiTransform,
            positions.map((entry) => ({ x: entry.currentLeft, y: entry.currentTop })),
            now,
            { pufferPitchOverride: frame.rotation, togglePufferMirror: true },
          );
        } else if (pufferEdgeResponse?.type === "vertical-reroute") {
          rerouteWalker(
            walker,
            currentLeft,
            currentTop,
            frame.rotation,
            frame.emojiTransform,
            positions.map((entry) => ({ x: entry.currentLeft, y: entry.currentTop })),
            now,
            { pufferPitchOverride: resolvePufferPitchForVerticalEdge(pufferEdgeResponse.edge) },
          );
        }
        visibleWalkers.push(walker);
        positions.push({
          centerX: currentLeft + (walker.width / 2),
          centerY: currentTop + (walker.height / 2),
          currentLeft,
          currentTop,
          fontSize: walker.fontSize,
          emojiTransform: frame.emojiTransform,
          rotation: frame.rotation,
          walker,
        });
      });

      const collisionPairs = findNearbyCollisionPairs(positions as any, {
        baseCollisionDistance: LOBSTER_COLLISION_DISTANCE_PX,
      }) as Array<[number, number]>;
      const reroutedWalkerIds = new Set<string>();

      collisionPairs.forEach(([currentIndex, otherIndex]) => {
        const current = positions[currentIndex];
        const other = positions[otherIndex];
        if (!current || !other) {
          return;
        }

          const distance = Math.hypot(current.centerX - other.centerX, current.centerY - other.centerY);
          const collisionDistance = Math.max(
            LOBSTER_COLLISION_DISTANCE_PX,
            ((current.fontSize + other.fontSize) * 0.42),
          );
          if (distance >= collisionDistance) {
            return;
          }

        const rerouteTarget = chooseCollisionRerouteTarget(current as any, other as any, {
          now,
          cooldownMs: LOBSTER_REROUTE_COOLDOWN_MS,
          reroutedWalkerIds,
        }) as any;
        if (!rerouteTarget) {
          return;
        }

        reroutedWalkerIds.add(rerouteTarget.walker.id);
        rerouteWalker(
          rerouteTarget.walker,
          rerouteTarget.currentLeft,
          rerouteTarget.currentTop,
          rerouteTarget.rotation,
          rerouteTarget.emojiTransform,
          positions
            .filter((entry) => entry.walker.id !== rerouteTarget.walker.id)
            .map((entry) => ({ x: entry.currentLeft, y: entry.currentTop })),
          now,
        );
      });

      if (visibleWalkers.length) {
        activeWalkersRef.current = visibleWalkers;
        if (visibleWalkers.length !== currentWalkers.length) {
          setActiveWalkers([...visibleWalkers]);
        }
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      activeWalkersRef.current = [];
      setActiveWalkers([]);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeWalkers]);

  const handleWalk = () => {
    if (activeWalkersRef.current.length || typeof window === "undefined" || !anchorRef.current) {
      return;
    }

    const rect = anchorRef.current.getBoundingClientRect();
    const anchorRect = {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
    const walkers: any[] = [createPrimaryWalker(anchorRect)];

    if (shouldSpawnLobsterCompanions()) {
      const companionCount = sampleLobsterCompanionCount();
      for (let index = 0; index < companionCount; index += 1) {
        walkers.push(createCompanionWalker(
          anchorRect,
          walkers.map((walker) => ({ x: walker.left, y: walker.top })),
        ));
      }
    }

    if (Math.random() <= CRAB_SPAWN_PROBABILITY) {
      walkers.push(createCrabWalker(
        anchorRect,
        walkers.map((walker) => ({ x: walker.left, y: walker.top })),
      ));
    }

    if (Math.random() <= OCTOPUS_SPAWN_PROBABILITY) {
      walkers.push(createOctopusWalker(
        anchorRect,
        walkers.map((walker) => ({ x: walker.left, y: walker.top })),
      ));
    }

    if (Math.random() <= PUFFER_SPAWN_PROBABILITY) {
      walkers.push(createPufferWalker(
        anchorRect,
        walkers.map((walker) => ({ x: walker.left, y: walker.top })),
      ));
    }

    if (Math.random() <= FISH_SPAWN_PROBABILITY) {
      walkers.push(createFishWalker(
        anchorRect,
        walkers.map((walker) => ({ x: walker.left, y: walker.top })),
      ));
    }

    if (Math.random() <= TROPICAL_FISH_SPAWN_PROBABILITY) {
      walkers.push(createTropicalFishWalker(
        anchorRect,
        walkers.map((walker) => ({ x: walker.left, y: walker.top })),
      ));
    }

    const startedAt = window.performance.now();
    const initializedWalkers = walkers.map((walker) => ({
      ...walker,
      animationStartedAt: startedAt,
      endAt: startedAt + walker.totalDurationMs,
      lastRerouteAt: 0,
      startedAt,
    }));
    activeWalkersRef.current = initializedWalkers;
    setActiveWalkers(initializedWalkers);
  };

  const primaryWalkerActive = activeWalkers.some((walker) => walker.type === "primary");

  return (
    <>
      <div className={cn("inline-flex min-w-0 items-center", compact ? "mr-3 gap-1 translate-y-[4px]" : "mr-1 h-14 gap-2")}>
        <button
          ref={anchorRef}
          type="button"
          onClick={handleWalk}
          aria-label={messages.app.walkLobster}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            compact ? "h-8 w-7 self-auto" : "h-10 w-10",
          )}
        >
          <span
            className={cn(
              compact ? "inline-block text-[1.25rem] leading-none" : "text-[1.8rem] leading-none",
              primaryWalkerActive && "opacity-0",
            )}
            aria-hidden="true"
          >
            🦞
          </span>
        </button>
        {compact ? (
          <div className="flex min-w-0 items-center self-auto">
            <h1 className="max-w-full truncate font-['Avenir_Next','SF_Pro_Display','Helvetica_Neue',sans-serif] text-[1.45rem] font-bold leading-none tracking-[-0.035em] text-foreground/85">
              LalaClaw
            </h1>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col justify-center">
            <h1 className="max-w-full truncate text-sm font-bold leading-[1.1] tracking-tight">LalaClaw</h1>
            <span className="mt-1 max-w-full truncate text-[11px] leading-4 text-muted-foreground">{subtitle}</span>
          </div>
        )}
      </div>

      {activeWalkers.length ? (
        <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
          {activeWalkers.map((walker) => (
            <div
              key={walker.id}
              ref={setWalkerContainerRef(walker.id)}
              className="absolute"
              style={{
                height: walker.height,
                left: walker.left,
                top: walker.top,
                width: walker.width,
              }}
            >
              <div ref={setWalkerMotionRef(walker.id)} className="flex h-full w-full items-center justify-center drop-shadow-sm will-change-transform">
                <span
                  ref={setWalkerEmojiRef(walker.id)}
                  className="inline-block leading-none"
                  style={{ fontSize: `${walker.fontSize}px` }}
                  aria-hidden="true"
                >
                  {walker.emoji || "🦞"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ImPlatformLogo({ channel }) {
  const brand = IM_PLATFORM_LOGOS[channel];

  if (!brand) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      data-im-logo={channel}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center self-center overflow-hidden rounded-[6px] bg-muted/65 [&_svg]:h-full [&_svg]:w-full",
      )}
      dangerouslySetInnerHTML={{ __html: brand.markup }}
    />
  );
}

export function SessionOverview({
  accessLoggingOut = false,
  accessMode = "off",
  availableAgents,
  availableImChannels = null,
  availableModels,
  composerSendMode = "enter-send",
  fastMode,
  formatCompactK,
  layout = "full",
  model,
  onAgentChange,
  onAccessLogout,
  onFastModeChange,
  onModelChange,
  onOpenImSession,
  onLoadImChannels,
  onSearchSessions,
  onSelectSearchedSession,
  onThinkModeChange,
  onThemeChange,
  openAgentIds = [],
  openSessionUsers = [],
  resolvedTheme,
  runtimeFallbackReason = "",
  runtimeReconnectAttempts = 0,
  runtimeSocketStatus = "disconnected",
  runtimeTransport = "polling",
  sessionOverviewPending = false,
  session,
  theme,
  extraControls,
}: SessionOverviewProps) {
  const { intlLocale, messages } = useI18n();
  const normalizedAvailableModels = availableModels || [];
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [sessionSearchChannel, setSessionSearchChannel] = useState("dingtalk-connector");
  const thinkModeLabels = messages.thinkModes;
  const getThinkModeLabel = (mode) => splitModeLabel(thinkModeLabels[mode] || mode).value;
  const getThinkModeDescription = (mode) => splitModeLabel(thinkModeLabels[mode] || mode).description;
  const isThinkModeEnabled = (session.thinkMode || "off") !== "off";
  const isLightTheme = resolvedTheme === "light";
  const pendingSummaryValue = messages.sessionOverview.pendingValue || "--";
  const pendingSummaryValueClassName = isLightTheme ? "text-slate-400" : "text-muted-foreground/70";
  const openClawConnected = session.mode === "openclaw" && !isOfflineStatus(session.status);
  const selectedModel = model || session.selectedModel || session.model || "";
  const displayedModel = formatModelLabel(selectedModel) || messages.common.unknown;
  const runtimeTransportLabel =
    messages.sessionOverview.runtimeTransport?.[runtimeTransport]
    || runtimeTransport;
  const runtimeTransportDisplayLabel = runtimeTransport === "ws" ? "WS" : runtimeTransportLabel;
  const runtimeSocketLabel =
    messages.sessionOverview.runtimeSocket?.[runtimeSocketStatus]
    || runtimeSocketStatus;
  const displayedModelValue = sessionOverviewPending ? pendingSummaryValue : displayedModel;
  const displayedContextValue = sessionOverviewPending
    ? pendingSummaryValue
    : `${formatCompactK(session.contextUsed)} / ${formatCompactK(session.contextMax)}`;
  const displayedFastModeValue = sessionOverviewPending
    ? pendingSummaryValue
    : (fastMode ? messages.sessionOverview.fastMode.on : messages.sessionOverview.fastMode.off);
  const displayedThinkModeValue = sessionOverviewPending
    ? pendingSummaryValue
    : getThinkModeDescription(session.thinkMode || "off");
  const displayedTransportValue = sessionOverviewPending
    ? pendingSummaryValue
    : `${runtimeTransportDisplayLabel} / ${runtimeSocketLabel}`;
  const runtimeTransportTooltipLabel = sessionOverviewPending ? pendingSummaryValue : runtimeTransportLabel;
  const runtimeSocketTooltipLabel = sessionOverviewPending ? pendingSummaryValue : runtimeSocketLabel;
  const normalizedOpenAgentIds = new Set(
    (openAgentIds || [])
      .map((agentId) => String(agentId || "").trim())
      .filter(Boolean),
  );
  const normalizedOpenImChannels = useMemo<Set<string>>(() => (
    new Set<string>(
      (openSessionUsers || [])
        .map((sessionUser) => resolveImSessionType(sessionUser))
        .filter(Boolean),
    )
  ), [openSessionUsers]);
  const selectableAgents = (availableAgents || []).filter((agentId) => !normalizedOpenAgentIds.has(String(agentId || "").trim()));
  const sessionSearchCopy = useMemo(() => (
    sessionSearchChannel === "feishu"
      ? messages.sessionOverview.feishuSessionSearch
      : sessionSearchChannel === "wecom"
        ? messages.sessionOverview.wecomSessionSearch
        : sessionSearchChannel === "openclaw-weixin"
          ? messages.sessionOverview.weixinSessionSearch
        : messages.sessionOverview.sessionSearch
  ), [messages, sessionSearchChannel]);
  const dingTalkLabel = getImSessionDisplayName("dingtalk-connector", { locale: intlLocale });
  const feishuLabel = getImSessionDisplayName("feishu:direct:demo", { locale: intlLocale });
  const wecomLabel = getImSessionDisplayName("wecom:direct:demo", { locale: intlLocale, shortWecom: true });
  const weixinLabel = getImSessionDisplayName("openclaw-weixin:direct:demo", { locale: intlLocale });
  const defaultModel = normalizedAvailableModels[0] || "";
  const getModelItemLabel = (modelId: string) => {
    const normalized = formatModelLabel(modelId);
    if (!modelId || modelId !== defaultModel) {
      return normalized;
    }
    return `${normalized} (${messages.common.default})`;
  };
  const normalizedContextUsed = Number(session.contextUsed) || 0;
  const normalizedContextMax = Number(session.contextMax) || 0;
  const contextUsageColor = getContextUsageColor(normalizedContextUsed, normalizedContextMax, resolvedTheme);
  const contextUsageRatio = getContextUsageRatio(normalizedContextUsed, normalizedContextMax);
  const openSessionSearch = useCallback((channel: string, suppressTooltip?: () => void) => {
    suppressTooltip?.();
    setSessionSearchChannel(channel);
    setSessionSearchOpen(true);
  }, []);
  const availableImMenuItems = useMemo(() => (
    [
      {
        channel: "dingtalk-connector",
        label: dingTalkLabel,
        type: "dingtalk",
        enabled: availableImChannels == null || availableImChannels["dingtalk-connector"]?.enabled !== false,
      },
      {
        channel: "feishu",
        label: feishuLabel,
        type: "feishu",
        enabled: availableImChannels == null || availableImChannels.feishu?.enabled !== false,
      },
      {
        channel: "wecom",
        label: wecomLabel,
        type: "wecom",
        enabled: availableImChannels == null || availableImChannels.wecom?.enabled !== false,
      },
      {
        channel: "openclaw-weixin",
        label: weixinLabel,
        type: "weixin",
        enabled: availableImChannels == null || availableImChannels["openclaw-weixin"]?.enabled !== false,
      },
    ].filter((item) => !normalizedOpenImChannels.has(item.type))
  ), [availableImChannels, dingTalkLabel, feishuLabel, normalizedOpenImChannels, wecomLabel, weixinLabel]);
  const handleImMenuSelect = useCallback((channel: string, suppressTooltip?: () => void) => {
    if (onOpenImSession) {
      suppressTooltip?.();
      void onOpenImSession(channel);
      return;
    }

    openSessionSearch(channel, suppressTooltip);
  }, [onOpenImSession, openSessionSearch]);

  const statusContent = (
    <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex min-w-max items-center gap-2">
        <SelectStatusPill
          disabled={!openClawConnected}
          label={messages.sessionOverview.labels.model}
          value={displayedModelValue}
          resolvedTheme={resolvedTheme}
          items={normalizedAvailableModels}
          onSelect={onModelChange}
          selectedValue={selectedModel}
          emptyText={messages.sessionOverview.menus.noModels}
          getItemLabel={getModelItemLabel}
          menuLabel={messages.sessionOverview.menus.switchModel}
          tooltipContent={messages.sessionOverview.tooltips.switchModel}
          valueClassName={sessionOverviewPending ? pendingSummaryValueClassName : undefined}
        />

        <StatusPill
          label={messages.sessionOverview.labels.context}
          value={displayedContextValue}
          valueClassName={sessionOverviewPending ? pendingSummaryValueClassName : undefined}
          valueNode={sessionOverviewPending
            ? <span className={pendingSummaryValueClassName}>{pendingSummaryValue}</span>
            : (
              <span className="inline-flex items-center gap-1.5">
                <span style={{ color: contextUsageColor }}>{formatCompactK(session.contextUsed)}</span>
                <span className={cn(isLightTheme ? "text-slate-900" : "text-foreground")}>
                  {" / "}
                  {formatCompactK(session.contextMax)}
                </span>
                <ContextUsageRing color={contextUsageColor} ratio={contextUsageRatio} resolvedTheme={resolvedTheme} />
              </span>
            )}
          resolvedTheme={resolvedTheme}
          tooltipContent={<ContextTooltipContent messages={messages} />}
        />

          <OverviewTooltip>
            <OverviewTooltipTrigger asChild>
            <button
              type="button"
              disabled={!openClawConnected}
              aria-pressed={fastMode}
              onClick={() => onFastModeChange?.(!fastMode)}
              className={cn(
                "inline-flex h-14 min-w-[88px] items-center gap-3 rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                isLightTheme ? "border-border/70 bg-white hover:bg-accent/40" : "border-border/70 bg-background/80 hover:bg-accent/40",
              )}
            >
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase text-muted-foreground">{messages.sessionOverview.labels.fastMode}</div>
                <div
                  className={cn(
                    "text-sm font-normal",
                    sessionOverviewPending
                      ? pendingSummaryValueClassName
                      : (fastMode && "dark:text-emerald-400"),
                  )}
                  style={
                    sessionOverviewPending
                      ? undefined
                      : (fastMode && resolvedTheme === "light" ? { color: "#009559" } : undefined)
                  }
                >
                  {displayedFastModeValue}
                </div>
              </div>
            </button>
            </OverviewTooltipTrigger>
          <OverviewTooltipContent side="bottom">
            <div className="space-y-0.5">
              <div>{messages.sessionOverview.tooltips.fastModeTitle}</div>
              <div className="text-[11px] text-muted-foreground">
                {messages.sessionOverview.tooltips.fastModeDescription}
              </div>
            </div>
          </OverviewTooltipContent>
        </OverviewTooltip>

        <SelectStatusPill
          disabled={!openClawConnected}
          label={messages.sessionOverview.labels.thinkMode}
          value={displayedThinkModeValue}
          resolvedTheme={resolvedTheme}
          valueClassName={cn(sessionOverviewPending ? pendingSummaryValueClassName : (isThinkModeEnabled && "dark:text-emerald-400"))}
          valueStyle={
            sessionOverviewPending
              ? undefined
              : (isThinkModeEnabled && resolvedTheme === "light" ? { color: "#009559" } : undefined)
          }
          items={thinkModeOptions}
          onSelect={onThinkModeChange}
          selectedValue={session.thinkMode || "off"}
          emptyText={messages.sessionOverview.menus.noThinkModes}
          getItemLabel={getThinkModeLabel}
          getItemDescription={getThinkModeDescription}
          menuLabel={messages.sessionOverview.menus.switchThinkMode}
          tooltipContent={(
            <div className="space-y-0.5">
              <div>{messages.sessionOverview.tooltips.thinkModeTitle}</div>
              <div className="text-[11px] text-muted-foreground">
                {messages.sessionOverview.tooltips.thinkModeDescription}
              </div>
            </div>
          )}
        />

        {session.mode === "openclaw" ? (
          <StatusPill
            label={messages.sessionOverview.labels.transport}
            value={displayedTransportValue}
            valueClassName={sessionOverviewPending ? pendingSummaryValueClassName : undefined}
            resolvedTheme={resolvedTheme}
            tooltipContent={(
              <TransportTooltipContent
                messages={messages}
                runtimeFallbackReason={sessionOverviewPending ? "" : runtimeFallbackReason}
                runtimeReconnectAttempts={sessionOverviewPending ? 0 : runtimeReconnectAttempts}
                runtimeSocketLabel={runtimeSocketTooltipLabel}
                runtimeTransportLabel={runtimeTransportTooltipLabel}
              />
            )}
          />
        ) : null}

      </div>
    </div>
  );

  const appearanceControls = (
    <div className="flex h-9 shrink-0 items-center">
      <div className="flex h-9 items-center gap-2">
        <LanguageToggle />
        <ThemeToggle value={theme} resolvedTheme={resolvedTheme} onChange={onThemeChange} />
        <ShortcutHelpButton composerSendMode={composerSendMode} />
        {accessMode === "token" && onAccessLogout ? <AccessLogoutButton loggingOut={accessLoggingOut} onLogout={onAccessLogout} /> : null}
        {extraControls}
      </div>
    </div>
  );

  if (layout === "brand") {
    return (
      <section className="pt-0 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <LobsterBrand subtitle={messages.app.subtitle} />
            </div>
          </div>
          {appearanceControls}
        </div>
      </section>
    );
  }

  if (layout === "tab-brand") {
    return <LobsterBrand compact />;
  }

  if (layout === "controls") {
    return (
      <section className="pt-0 pb-0">
        <div className="flex justify-end">{appearanceControls}</div>
      </section>
    );
  }

  if (layout === "agent-tab") {
    return (
      <>
        <div className="flex items-center">
          <SelectionMenu
            disabled={!openClawConnected}
            label={messages.sessionOverview.menus.switchAgent}
            onOpenChange={(nextOpen) => {
              if (nextOpen) {
                void onLoadImChannels?.();
              }
            }}
            triggerLabel={messages.sessionOverview.menus.switchAgentTrigger || messages.sessionOverview.menus.switchAgent}
            value={session.agentId}
            onSelect={(item) => onAgentChange?.(String(item))}
            showSelectionIndicator={false}
            contentClassName="w-[300px] max-w-[calc(100vw-1rem)] p-2"
            emptyText={messages.sessionOverview.menus.noAvailableAgentSessionsHint || messages.sessionOverview.menus.noAgents}
            tooltipContent={messages.sessionOverview.tooltips.switchAgentSession}
            renderContent={({ handleSelect, suppressTooltip }) => (
              <>
                <OverviewDropdownMenuLabel className="px-1 pb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.sessionOverview.menus.agentConversations || messages.sessionOverview.menus.switchAgent}
                </OverviewDropdownMenuLabel>
                {selectableAgents.length ? (
                  selectableAgents.map((agentId) => (
                    <OverviewDropdownMenuItem key={agentId} onSelect={() => handleSelect(agentId)}>
                      {agentId}
                    </OverviewDropdownMenuItem>
                  ))
                ) : (
                  <div className="px-1 py-1">
                    <div className="rounded-md bg-background/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground whitespace-pre-line break-words">
                      {messages.sessionOverview.menus.noAvailableAgentSessionsHint || messages.sessionOverview.menus.noAgents}
                    </div>
                  </div>
                )}
                {(onOpenImSession || (onSearchSessions && onSelectSearchedSession)) && availableImMenuItems.length ? (
                  <>
                    <OverviewDropdownMenuSeparator />
                    <OverviewDropdownMenuLabel className="px-1 pb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.sessionOverview.menus.imConversations || messages.sessionOverview.sessionSearch?.title || messages.sessionOverview.menus.switchAgent}
                    </OverviewDropdownMenuLabel>
                    {availableImMenuItems.map((item) => (
                      <OverviewDropdownMenuItem
                        key={item.channel}
                        disabled={!item.enabled}
                        onSelect={() => {
                          if (item.enabled) {
                            handleImMenuSelect(item.channel, suppressTooltip);
                          }
                        }}
                        className={cn(
                          !item.enabled && "cursor-not-allowed opacity-55 focus:bg-transparent focus:text-inherit",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2 leading-none">
                          <ImPlatformLogo channel={item.channel} />
                          <span className="self-center leading-none">{item.label}</span>
                          {!item.enabled ? (
                            <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-border/70 bg-muted/55 px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                              {messages.sessionOverview.menus.imPluginDisabled}
                            </span>
                          ) : null}
                        </div>
                      </OverviewDropdownMenuItem>
                    ))}
                  </>
                ) : null}
              </>
            )}
          >
            <button
              type="button"
              disabled={!openClawConnected}
              aria-label={messages.sessionOverview.menus.switchAgentTrigger || messages.sessionOverview.menus.switchAgent}
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-[background-color,border-color,color] focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-55",
                "border-border/80 bg-muted/20 text-foreground hover:border-border hover:bg-muted/45 focus-visible:border-border focus-visible:bg-muted/45 focus-visible:ring-border/50",
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </SelectionMenu>
        </div>
        <SessionSearchDialog
          messages={messages}
          onClose={() => setSessionSearchOpen(false)}
          onSearchSessions={onSearchSessions}
          onSelectSearchedSession={onSelectSearchedSession}
          open={sessionSearchOpen}
          searchChannel={sessionSearchChannel}
          searchMessages={sessionSearchCopy}
        />
      </>
    );
  }

  if (layout === "status") {
    return (
      <section className="pt-0 pb-0">
        {statusContent}
        <SessionSearchDialog
          messages={messages}
          onClose={() => setSessionSearchOpen(false)}
          onSearchSessions={onSearchSessions}
          onSelectSearchedSession={onSelectSearchedSession}
          open={sessionSearchOpen}
          searchChannel={sessionSearchChannel}
          searchMessages={sessionSearchCopy}
        />
      </section>
    );
  }

  return (
    <section className="pt-0 pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
          <div className="flex min-w-max items-center gap-2">
            <LobsterBrand subtitle={messages.app.subtitle} />
          </div>
        </div>
        {statusContent}
        {appearanceControls}
      </div>
    </section>
  );
}
