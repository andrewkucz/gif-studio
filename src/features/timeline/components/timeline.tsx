import { useEffect, useMemo, useRef, useState } from "react"

import { ChevronDownIcon, LocateFixedIcon } from "lucide-react"
import { useMaskInput } from "use-mask-input"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
} from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  formatDuration,
  formatFrameRate,
  formatTimeInputValue,
  getFormattedTimeShape,
  getTrimDuration,
  parseTimeInputValue,
  shiftLockedTrimWindow,
  type TimeDisplayFormat,
  trimWindowFromStartAndEnd,
  trimWindowFromStartAndLength,
} from "@/lib/studio-utils"
import type { TimelineThumbnail } from "@/lib/media/thumbnail-service"
import type { RangeInputMode } from "@/state/studio-store"
import { cn } from "@/lib/utils"

import { FrameStrip } from "./frame-strip"

interface StudioTimelineProps {
  canPlaySelection: boolean
  currentTime: number
  duration: number
  frameRate: number
  inputMode: RangeInputMode
  isTrimEnabled: boolean
  isDurationLocked: boolean
  isTrimPlaybackLoopEnabled: boolean
  isLoading: boolean
  thumbnails: TimelineThumbnail[]
  trimWindow: [number, number]
  onTrimEnabledChange: (value: boolean) => void
  onDurationLockChange: (value: boolean) => void
  onInputModeChange: (mode: RangeInputMode) => void
  onTrimPlaybackLoopEnabledChange: (value: boolean) => void
  onPlaySelection: (selection: { start: number; end: number; loop: boolean }) => void
  onSeek: (time: number) => void
  onTrimChange: (window: [number, number]) => void
}

interface TimelineTimeFieldProps {
  value: string
  format: TimeDisplayFormat
  id: string
  totalDuration: number
  onApplyCurrentTime?: () => string
  onCommit: (value: string) => string
}

type DragTarget = "start" | "end" | "window"

interface DragState {
  pointerId: number
  startClientX: number
  target: DragTarget
  trimWindow: [number, number]
}

const timeFormatOptions: Array<{ label: string; value: TimeDisplayFormat }> = [
  { label: "Seconds", value: "seconds" },
  { label: "Milliseconds", value: "milliseconds" },
  { label: "Frame number", value: "frames" },
]

function getFormattedTimeLabel(totalDuration: number) {
  const shape = getFormattedTimeShape(totalDuration)

  switch (shape) {
    case "ss":
      return "SS(.ss)"
    case "mm:ss":
      return "MM:SS(.ss)"
    case "hh:mm:ss":
    default:
      return "HH:MM:SS(.ss)"
  }
}

function getFormattedTimeMasks(totalDuration: number) {
  const shape = getFormattedTimeShape(totalDuration)

  switch (shape) {
    case "ss":
      return ["99", "99.9", "99.99"]
    case "mm:ss":
      return ["99:99", "99:99.9", "99:99.99"]
    case "hh:mm:ss":
    default:
      return ["99:99:99", "99:99:99.9", "99:99:99.99"]
  }
}

function getTimeFormatSuffix(format: TimeDisplayFormat) {
  switch (format) {
    case "frames":
      return "fr"
    case "milliseconds":
      return "ms"
    case "seconds":
      return "s"
    case "formatted":
    default:
      return null
  }
}

function getTimeFormatPlaceholder(format: TimeDisplayFormat, totalDuration: number) {
  switch (format) {
    case "frames":
      return "24"
    case "milliseconds":
      return "1500"
    case "seconds":
      return "1.5"
    case "formatted":
    default:
      return getFormattedTimeLabel(totalDuration).replace("(.ss)", "")
  }
}

function getTimeFormatInputStep(format: TimeDisplayFormat) {
  switch (format) {
    case "frames":
      return 1
    case "milliseconds":
      return 100
    case "seconds":
      return 0.1
    case "formatted":
    default:
      return undefined
  }
}

function getKeyboardTrimStep(
  format: TimeDisplayFormat,
  totalDuration: number,
  frameRate: number
) {
  switch (format) {
    case "frames":
      return Number.isFinite(frameRate) && frameRate > 0 ? 1 / frameRate : 0.1
    case "milliseconds":
      return 0.1
    case "seconds":
      return 0.1
    case "formatted":
      return getFormattedTimeShape(totalDuration) === "hh:mm:ss" ? 1 : 1
    default:
      return 0.1
  }
}

function TimelineTimeField({
  value,
  format,
  id,
  totalDuration,
  onApplyCurrentTime,
  onCommit,
}: TimelineTimeFieldProps) {
  const [draft, setDraft] = useState(value)
  const suffix = getTimeFormatSuffix(format)
  const inputStep = getTimeFormatInputStep(format)
  const inputType = format === "formatted" ? "text" : "number"
  const maskRef = useMaskInput({
    mask: format === "formatted" ? getFormattedTimeMasks(totalDuration) : null,
  })

  return (
    <InputGroup>
      <input
        autoComplete="off"
        className={cn(
          "flex-1 rounded-none border-0 bg-transparent px-2.5 py-1 text-base shadow-none outline-none ring-0",
          "placeholder:text-muted-foreground focus-visible:ring-0 md:text-sm"
        )}
        data-slot="input-group-control"
        id={id}
        inputMode={format === "formatted" ? "text" : format === "seconds" ? "decimal" : "numeric"}
        min={format === "formatted" ? undefined : 0}
        placeholder={getTimeFormatPlaceholder(format, totalDuration)}
        ref={maskRef}
        step={inputStep}
        type={inputType}
        value={draft}
        onBlur={() => {
          setDraft(onCommit(draft))
        }}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
      />
      {onApplyCurrentTime ? (
        <InputGroupAddon align="inline-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <InputGroupButton
                aria-label="Use current playback time"
                size="icon-xs"
                onClick={() => {
                  setDraft(onApplyCurrentTime())
                }}
              >
                <LocateFixedIcon />
              </InputGroupButton>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>Use current playback time</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      ) : null}
      {suffix ? (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{suffix}</InputGroupText>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}

export function StudioTimeline({
  canPlaySelection,
  currentTime,
  duration,
  frameRate,
  inputMode,
  isTrimEnabled,
  isDurationLocked,
  isTrimPlaybackLoopEnabled,
  isLoading,
  thumbnails,
  trimWindow,
  onTrimEnabledChange,
  onDurationLockChange,
  onInputModeChange,
  onTrimPlaybackLoopEnabledChange,
  onPlaySelection,
  onSeek,
  onTrimChange,
}: StudioTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [timeFormat, setTimeFormat] = useState<TimeDisplayFormat>("seconds")
  const supportsFormattedTime = duration >= 60
  const activeTimeFormat =
    !supportsFormattedTime && timeFormat === "formatted" ? "seconds" : timeFormat
  const keyboardTrimStep = useMemo(
    () => getKeyboardTrimStep(activeTimeFormat, duration, frameRate),
    [activeTimeFormat, duration, frameRate]
  )
  const availableTimeFormats = useMemo(
    () =>
      supportsFormattedTime
        ? [{ label: getFormattedTimeLabel(duration), value: "formatted" as const }, ...timeFormatOptions]
        : timeFormatOptions,
    [duration, supportsFormattedTime]
  )

  const selectionDuration = useMemo(() => getTrimDuration(trimWindow), [trimWindow])
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const startPercent = duration > 0 ? (trimWindow[0] / duration) * 100 : 0
  const widthPercent = duration > 0 ? (selectionDuration / duration) * 100 : 0
  const startInputValue = formatTimeInputValue(trimWindow[0], activeTimeFormat, duration, frameRate)
  const secondaryInputValue = formatTimeInputValue(
    inputMode === "start-length" ? selectionDuration : trimWindow[1],
    activeTimeFormat,
    duration,
    frameRate
  )

  useEffect(() => {
    if (!dragState) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId || !trackRef.current || duration <= 0) {
        return
      }

      const rect = trackRef.current.getBoundingClientRect()
      const deltaSeconds = ((event.clientX - dragState.startClientX) / rect.width) * duration

      if (dragState.target === "window") {
        const nextWindow = shiftLockedTrimWindow(dragState.trimWindow, deltaSeconds, duration)
        onTrimChange(nextWindow)
        onSeek(nextWindow[0])
        return
      }

      if (dragState.target === "start") {
        const nextWindow = trimWindowFromStartAndEnd(
          dragState.trimWindow[0] + deltaSeconds,
          dragState.trimWindow[1],
          duration
        )
        onTrimChange(nextWindow)
        onSeek(nextWindow[0])
        return
      }

      const nextWindow = trimWindowFromStartAndEnd(
        dragState.trimWindow[0],
        dragState.trimWindow[1] + deltaSeconds,
        duration
      )
      onTrimChange(nextWindow)
      onSeek(nextWindow[1])
    }

    const clearDrag = () => {
      setDragState(null)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", clearDrag)
    window.addEventListener("pointercancel", clearDrag)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", clearDrag)
      window.removeEventListener("pointercancel", clearDrag)
    }
  }, [dragState, duration, onSeek, onTrimChange])

  const commitStartValue = (rawValue: string) => {
    const parsedValue = parseTimeInputValue(rawValue, activeTimeFormat, duration, frameRate)
    if (parsedValue === null) {
      return startInputValue
    }

    const nextWindow =
      inputMode === "start-length"
        ? trimWindowFromStartAndLength(parsedValue, selectionDuration, duration)
        : trimWindowFromStartAndEnd(parsedValue, trimWindow[1], duration)

    onTrimChange(nextWindow)
    return formatTimeInputValue(nextWindow[0], activeTimeFormat, duration, frameRate)
  }

  const commitSecondaryValue = (rawValue: string) => {
    const parsedValue = parseTimeInputValue(rawValue, activeTimeFormat, duration, frameRate)
    if (parsedValue === null) {
      return secondaryInputValue
    }

    const nextWindow =
      inputMode === "start-length"
        ? trimWindowFromStartAndLength(trimWindow[0], parsedValue, duration)
        : trimWindowFromStartAndEnd(trimWindow[0], parsedValue, duration)

    onTrimChange(nextWindow)

    return formatTimeInputValue(
      inputMode === "start-length" ? getTrimDuration(nextWindow) : nextWindow[1],
      activeTimeFormat,
      duration,
      frameRate
    )
  }

  const beginDrag = (target: DragTarget) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) {
      return
    }

    if (target !== "window" && isDurationLocked) {
      return
    }

    event.preventDefault()
    setDragState({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      target,
      trimWindow,
    })
  }

  const nudgeTrimHandle =
    (target: DragTarget) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (duration <= 0) {
        return
      }

      if (target !== "window" && isDurationLocked) {
        return
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return
      }

      event.preventDefault()

      const nudgeAmount = event.shiftKey ? keyboardTrimStep * 10 : keyboardTrimStep
      const delta = event.key === "ArrowRight" ? nudgeAmount : -nudgeAmount
      const nextWindow =
        target === "window"
          ? shiftLockedTrimWindow(trimWindow, delta, duration)
          : target === "start"
          ? trimWindowFromStartAndEnd(trimWindow[0] + delta, trimWindow[1], duration)
          : trimWindowFromStartAndEnd(trimWindow[0], trimWindow[1] + delta, duration)

      onTrimChange(nextWindow)
      onSeek(target === "end" ? nextWindow[1] : nextWindow[0])
    }

  const applyCurrentTimeToStart = () =>
    commitStartValue(formatTimeInputValue(currentTime, activeTimeFormat, duration, frameRate))
  const applyCurrentTimeToSecondary = () =>
    commitSecondaryValue(formatTimeInputValue(currentTime, activeTimeFormat, duration, frameRate))
  const headerDescription = isTrimEnabled
    ? "Choose the exact window you want to export. Thumbnail previews are cached locally for the current source."
    : "Export the full source video without trimming. Your previous trim selection stays saved in case you turn this back on."

  return (
    <Card className="border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader className="gap-2">
        <label
          className="flex cursor-pointer items-start gap-3 transition-colors"
          htmlFor="trim-enabled"
        >
          <Checkbox
            checked={isTrimEnabled}
            className="mt-0.5 size-5 rounded-md"
            id="trim-enabled"
            onCheckedChange={(checked) => onTrimEnabledChange(checked === true)}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Trim video</CardTitle>
                <CardDescription>{headerDescription}</CardDescription>
              </div>
              <ChevronDownIcon
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                  isTrimEnabled ? "rotate-0" : "-rotate-90"
                )}
              />
            </div>

          </div>
        </label>
      </CardHeader>
      {isTrimEnabled ? (
        <CardContent className="space-y-4">
          <div className="space-y-4 rounded-xl border border-border/60 bg-muted/25 p-3">
            <FrameStrip
              currentTime={currentTime}
              duration={duration}
              isLoading={isLoading}
              thumbnails={thumbnails}
              onSeek={onSeek}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDuration(selectionDuration)} selected</span>
                <span>{formatDuration(duration)} total</span>
              </div>

              <div
                ref={trackRef}
                className="relative h-8 rounded-full bg-background/80 ring-1 ring-border/70"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-px bg-primary/80"
                  style={{ left: `calc(${currentPercent}% - 0.5px)` }}
                />

                <div
                  role="slider"
                  aria-label="Trim window"
                  aria-disabled={false}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(duration - selectionDuration, 0)}
                  aria-valuenow={trimWindow[0]}
                  aria-valuetext={`${formatDuration(trimWindow[0])} to ${formatDuration(trimWindow[1])}`}
                  tabIndex={0}
                  className={cn(
                    "absolute top-1/2 h-4 -translate-y-1/2 rounded-full border border-primary/60 bg-primary/25 outline-none transition-shadow",
                    "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.85),0_0_0_5px_rgba(59,130,246,0.22)]",
                    "cursor-grab active:cursor-grabbing"
                  )}
                  style={{
                    left: `${startPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  onKeyDown={nudgeTrimHandle("window")}
                  onPointerDown={beginDrag("window")}
                />

                <div
                  role="slider"
                  aria-label="Trim start"
                  aria-disabled={isDurationLocked}
                  aria-valuemin={0}
                  aria-valuemax={trimWindow[1]}
                  aria-valuenow={trimWindow[0]}
                  tabIndex={isDurationLocked ? -1 : 0}
                  className={cn(
                    "absolute top-1/2 z-10 size-5 -translate-y-1/2 rounded-full border border-primary/80 bg-background shadow-sm outline-none transition-shadow",
                    "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_0_0_5px_rgba(59,130,246,0.24)]",
                    isDurationLocked ? "cursor-not-allowed opacity-45" : "cursor-ew-resize"
                  )}
                  style={{ left: `calc(${startPercent}% - 10px)` }}
                  onKeyDown={nudgeTrimHandle("start")}
                  onPointerDown={beginDrag("start")}
                />

                <div
                  role="slider"
                  aria-label="Trim end"
                  aria-disabled={isDurationLocked}
                  aria-valuemin={trimWindow[0]}
                  aria-valuemax={duration}
                  aria-valuenow={trimWindow[1]}
                  tabIndex={isDurationLocked ? -1 : 0}
                  className={cn(
                    "absolute top-1/2 z-10 size-5 -translate-y-1/2 rounded-full border border-primary/80 bg-background shadow-sm outline-none transition-shadow",
                    "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_0_0_5px_rgba(59,130,246,0.24)]",
                    isDurationLocked ? "cursor-not-allowed opacity-45" : "cursor-ew-resize"
                  )}
                  style={{ left: `calc(${startPercent + widthPercent}% - 10px)` }}
                  onKeyDown={nudgeTrimHandle("end")}
                  onPointerDown={beginDrag("end")}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={isDurationLocked}
                  id="lock-duration"
                  onCheckedChange={(checked) => onDurationLockChange(checked === true)}
                />
                <span>Lock duration</span>
              </label>
              {canPlaySelection ? (
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button
                    disabled={selectionDuration <= 0}
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      onPlaySelection({
                      start: trimWindow[0],
                      end: trimWindow[1],
                      loop: isTrimPlaybackLoopEnabled,
                    })
                  }
                >
                  Play preview
                </Button>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={isTrimPlaybackLoopEnabled}
                    id="loop-selection-playback"
                    onCheckedChange={(checked) => onTrimPlaybackLoopEnabledChange(checked === true)}
                  />
                  <span>Loop</span>
                </label>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="trim-start-input"
                >
                  Start time
                </label>
                <TimelineTimeField
                  key={`start-${activeTimeFormat}-${startInputValue}`}
                  format={activeTimeFormat}
                  id="trim-start-input"
                  totalDuration={duration}
                  value={startInputValue}
                  onApplyCurrentTime={applyCurrentTimeToStart}
                  onCommit={commitStartValue}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="trim-secondary-input"
                >
                  {inputMode === "start-length" ? "Duration" : "End time"}
                </label>
                <TimelineTimeField
                  key={`secondary-${inputMode}-${activeTimeFormat}-${secondaryInputValue}`}
                  format={activeTimeFormat}
                  id="trim-secondary-input"
                  totalDuration={duration}
                  value={secondaryInputValue}
                  onApplyCurrentTime={
                    inputMode === "start-end" ? applyCurrentTimeToSecondary : undefined
                  }
                  onCommit={commitSecondaryValue}
                />
                <div className="inline-flex w-fit rounded-lg border border-border/70 bg-background/60 p-1">
                  <Button
                    size="sm"
                    type="button"
                    variant={inputMode === "start-end" ? "secondary" : "ghost"}
                    onClick={() => onInputModeChange("start-end")}
                  >
                    End time
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant={inputMode === "start-length" ? "secondary" : "ghost"}
                    onClick={() => onInputModeChange("start-length")}
                  >
                    Duration
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="time-format-select"
              >
                Time format
              </label>
              <select
                className={cn(
                  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                )}
                id="time-format-select"
                value={activeTimeFormat}
                onChange={(event) => setTimeFormat(event.target.value as TimeDisplayFormat)}
              >
                {availableTimeFormats.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            {activeTimeFormat === "frames" ? (
              <p className="text-xs text-muted-foreground">
                Frame numbers are calculated using the source video frame rate: {formatFrameRate(frameRate)}.
              </p>
            ) : null}
            </div>
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
