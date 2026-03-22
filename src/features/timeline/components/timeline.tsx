import { useEffect, useMemo, useRef, useState } from "react"

import { LocateFixedIcon } from "lucide-react"
import { useMaskInput } from "use-mask-input"

import { Badge } from "@/components/ui/badge"
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
  currentTime: number
  duration: number
  frameRate: number
  inputMode: RangeInputMode
  isDurationLocked: boolean
  isLoading: boolean
  thumbnails: TimelineThumbnail[]
  trimWindow: [number, number]
  onDurationLockChange: (value: boolean) => void
  onInputModeChange: (mode: RangeInputMode) => void
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
  { label: "Frame number (GIF fps)", value: "frames" },
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
        inputMode={format === "formatted" ? "text" : "numeric"}
        placeholder={getTimeFormatPlaceholder(format, totalDuration)}
        ref={maskRef}
        type="text"
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
  currentTime,
  duration,
  frameRate,
  inputMode,
  isDurationLocked,
  isLoading,
  thumbnails,
  trimWindow,
  onDurationLockChange,
  onInputModeChange,
  onSeek,
  onTrimChange,
}: StudioTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [timeFormat, setTimeFormat] = useState<TimeDisplayFormat>("seconds")
  const supportsFormattedTime = duration >= 60
  const activeTimeFormat =
    !supportsFormattedTime && timeFormat === "formatted" ? "seconds" : timeFormat
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
      onSeek(nextWindow[0])
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

  const applyCurrentTimeToStart = () =>
    commitStartValue(formatTimeInputValue(currentTime, activeTimeFormat, duration, frameRate))
  const applyCurrentTimeToSecondary = () =>
    commitSecondaryValue(formatTimeInputValue(currentTime, activeTimeFormat, duration, frameRate))

  return (
    <Card className="border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader>
        <CardTitle>Trim window</CardTitle>
        <CardDescription>
          Thumbnails are generated on demand and cached locally for the current source.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">Start {formatDuration(trimWindow[0])}</Badge>
          <Badge variant="outline">End {formatDuration(trimWindow[1])}</Badge>
          <Badge variant="secondary">Clip {formatDuration(selectionDuration)}</Badge>
        </div>

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
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 h-4 -translate-y-1/2 rounded-full border border-primary/60 bg-primary/25",
                  isDurationLocked && "cursor-grab active:cursor-grabbing"
                )}
                style={{
                  left: `${startPercent}%`,
                  width: `${widthPercent}%`,
                }}
                onPointerDown={isDurationLocked ? beginDrag("window") : undefined}
              />

              <div
                role="slider"
                aria-label="Trim start"
                aria-valuemin={0}
                aria-valuemax={trimWindow[1]}
                aria-valuenow={trimWindow[0]}
                className={cn(
                  "absolute top-1/2 size-5 -translate-y-1/2 rounded-full border border-primary/80 bg-background shadow-sm",
                  isDurationLocked ? "cursor-not-allowed opacity-45" : "cursor-ew-resize"
                )}
                style={{ left: `calc(${startPercent}% - 10px)` }}
                onPointerDown={beginDrag("start")}
              />

              <div
                role="slider"
                aria-label="Trim end"
                aria-valuemin={trimWindow[0]}
                aria-valuemax={duration}
                aria-valuenow={trimWindow[1]}
                className={cn(
                  "absolute top-1/2 size-5 -translate-y-1/2 rounded-full border border-primary/80 bg-background shadow-sm",
                  isDurationLocked ? "cursor-not-allowed opacity-45" : "cursor-ew-resize"
                )}
                style={{ left: `calc(${startPercent + widthPercent}% - 10px)` }}
                onPointerDown={beginDrag("end")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={isDurationLocked}
                id="lock-duration"
                onCheckedChange={(checked) => onDurationLockChange(checked === true)}
              />
              <span>Lock duration</span>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="trim-start-input">
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
                onApplyCurrentTime={inputMode === "start-end" ? applyCurrentTimeToSecondary : undefined}
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
            <label className="text-xs font-medium text-muted-foreground" htmlFor="time-format-select">
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
                Frame numbers are calculated using the current GIF frame rate: {frameRate} fps.
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
