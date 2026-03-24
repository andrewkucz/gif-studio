import type { GifColorPreset, GifSettings } from "@/state/studio-store"

export const MIN_TRIM_DURATION = 0.1
export type TimeDisplayFormat = "formatted" | "seconds" | "milliseconds" | "frames"
export type FormattedTimeShape = "ss" | "mm:ss" | "hh:mm:ss"

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function roundSeconds(value: number) {
  return Math.round(value * 100) / 100
}

export function getTrimDuration(trimWindow: [number, number]) {
  return roundSeconds(Math.max(trimWindow[1] - trimWindow[0], 0))
}

export function normalizeTrimWindow(
  trimWindow: [number, number],
  totalDuration: number,
  minimumDuration = MIN_TRIM_DURATION
): [number, number] {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    return [0, 0]
  }

  const safeMinimum = Math.min(minimumDuration, totalDuration)
  let [start, end] = trimWindow

  start = Number.isFinite(start) ? start : 0
  end = Number.isFinite(end) ? end : safeMinimum

  start = clampNumber(start, 0, totalDuration)
  end = clampNumber(end, 0, totalDuration)

  if (end < start) {
    ;[start, end] = [end, start]
  }

  if (end - start < safeMinimum) {
    if (start + safeMinimum <= totalDuration) {
      end = start + safeMinimum
    } else {
      end = totalDuration
      start = Math.max(0, end - safeMinimum)
    }
  }

  return [roundSeconds(start), roundSeconds(end)]
}

export function trimWindowFromStartAndLength(
  start: number,
  length: number,
  totalDuration: number,
  minimumDuration = MIN_TRIM_DURATION
): [number, number] {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    return [0, 0]
  }

  const safeMinimum = Math.min(minimumDuration, totalDuration)
  const nextLength = clampNumber(length, safeMinimum, totalDuration)
  const maxStart = Math.max(totalDuration - nextLength, 0)
  const nextStart = clampNumber(start, 0, maxStart)

  return normalizeTrimWindow([nextStart, nextStart + nextLength], totalDuration, minimumDuration)
}

export function trimWindowFromStartAndEnd(
  start: number,
  end: number,
  totalDuration: number,
  minimumDuration = MIN_TRIM_DURATION
): [number, number] {
  return normalizeTrimWindow([start, end], totalDuration, minimumDuration)
}

export function shiftLockedTrimWindow(
  trimWindow: [number, number],
  delta: number,
  totalDuration: number,
  minimumDuration = MIN_TRIM_DURATION
): [number, number] {
  const normalizedWindow = normalizeTrimWindow(trimWindow, totalDuration, minimumDuration)
  const width = getTrimDuration(normalizedWindow)
  const maxStart = Math.max(totalDuration - width, 0)
  const nextStart = clampNumber(normalizedWindow[0] + delta, 0, maxStart)

  return [roundSeconds(nextStart), roundSeconds(nextStart + width)]
}

export function formatSecondsInput(value: number) {
  const rounded = roundSeconds(value)
  return rounded.toFixed(2).replace(/\.?0+$/, "")
}

export function formatMillisecondsInput(value: number) {
  return `${Math.round(value * 1000)}`
}

export function formatFramesInput(valueInSeconds: number, frameRate: number) {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    return "0"
  }

  return `${Math.max(0, Math.round(valueInSeconds * frameRate))}`
}

export function getFormattedTimeShape(totalDurationInSeconds: number): FormattedTimeShape {
  if (totalDurationInSeconds < 60) {
    return "ss"
  }

  if (totalDurationInSeconds < 3600) {
    return "mm:ss"
  }

  return "hh:mm:ss"
}

export function formatFormattedTimeInput(
  valueInSeconds: number,
  totalDurationInSeconds: number
) {
  const rounded = roundSeconds(Math.max(0, valueInSeconds))
  const wholeSeconds = Math.floor(rounded)
  const fraction = rounded - wholeSeconds
  const fractionText =
    fraction > 0 ? rounded.toFixed(2).split(".")[1]?.replace(/0+$/, "") ?? "" : ""
  const decimalSuffix = fractionText ? `.${fractionText}` : ""
  const shape = getFormattedTimeShape(totalDurationInSeconds)

  if (shape === "ss") {
    return `${wholeSeconds}${decimalSuffix}`
  }

  if (shape === "mm:ss") {
    const minutes = Math.floor(wholeSeconds / 60)
    const seconds = wholeSeconds % 60
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}${decimalSuffix}`
  }

  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const seconds = wholeSeconds % 60

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}${decimalSuffix}`
}

export function formatTimeInputValue(
  valueInSeconds: number,
  format: TimeDisplayFormat,
  totalDurationInSeconds: number,
  frameRate: number
) {
  switch (format) {
    case "frames":
      return formatFramesInput(valueInSeconds, frameRate)
    case "milliseconds":
      return formatMillisecondsInput(valueInSeconds)
    case "formatted":
      return formatFormattedTimeInput(valueInSeconds, totalDurationInSeconds)
    case "seconds":
    default:
      return formatSecondsInput(valueInSeconds)
  }
}

export function parseTimeInputValue(
  rawValue: string,
  format: TimeDisplayFormat,
  totalDurationInSeconds: number,
  frameRate: number
): number | null {
  const value = rawValue.trim()

  if (!value) {
    return null
  }

  if (format === "seconds") {
    const seconds = Number(value)
    return Number.isFinite(seconds) ? seconds : null
  }

  if (format === "frames") {
    const frames = Number(value)
    if (!Number.isFinite(frames) || !Number.isFinite(frameRate) || frameRate <= 0) {
      return null
    }

    return Math.max(0, Math.round(frames)) / frameRate
  }

  if (format === "milliseconds") {
    const milliseconds = Number(value)
    return Number.isFinite(milliseconds) ? milliseconds / 1000 : null
  }

  const parts = value.split(":").map((part) => part.trim())
  const shape = getFormattedTimeShape(totalDurationInSeconds)
  const expectedParts = shape === "ss" ? 1 : shape === "mm:ss" ? 2 : 3

  if (parts.some((part) => part.length === 0) || parts.length !== expectedParts) {
    return null
  }

  const numericParts = parts.map((part) => Number(part))
  if (numericParts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null
  }

  let seconds = 0
  if (shape === "hh:mm:ss") {
    seconds = numericParts[0] * 3600 + numericParts[1] * 60 + numericParts[2]
  } else if (shape === "mm:ss") {
    seconds = numericParts[0] * 60 + numericParts[1]
  } else {
    seconds = numericParts[0]
  }

  return seconds
}

export function formatDuration(valueInSeconds: number) {
  if (!Number.isFinite(valueInSeconds)) {
    return "00:00"
  }

  const totalMilliseconds = Math.max(0, Math.round(valueInSeconds * 1000))
  const totalSeconds = Math.floor(totalMilliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const milliseconds = Math.floor((totalMilliseconds % 1000) / 10)

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export function sanitizeBaseName(name: string) {
  const base = name.replace(/\.[^.]+$/, "")

  return base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "") || "untitled"
}

export function getFileExtension(name: string) {
  const parts = name.split(".")
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() ?? "" : ""
}

export function createOutputFileName(name: string) {
  const sanitized = sanitizeBaseName(name)
  return sanitized.endsWith(".gif") ? sanitized : `${sanitized}.gif`
}

export function getMaxGifFrameRate(sourceFrameRate: number) {
  if (!Number.isFinite(sourceFrameRate) || sourceFrameRate <= 0) {
    return 24
  }

  return Math.max(1, Math.floor(sourceFrameRate))
}

export function formatFrameRate(frameRate: number) {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    return "Unknown"
  }

  const decimals = Number.isInteger(frameRate) ? 0 : 1
  return `${frameRate.toFixed(decimals)} fps`
}

export interface GifColorPresetOption {
  value: GifColorPreset
  label: string
  description: string
}

interface GifColorPresetConfig {
  maxColors: number
  paletteStatsMode: "full" | "diff"
  paletteDither: "sierra2_4a" | "bayer"
}

export const gifColorPresetOptions: GifColorPresetOption[] = [
  {
    value: "original",
    label: "Original",
    description: "Best color preservation and smoothest gradients. Largest files.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "A middle ground between color fidelity and file size.",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Smaller files with a more limited palette.",
  },
]

export function getGifColorPresetConfig(colorPreset: GifColorPreset): GifColorPresetConfig {
  switch (colorPreset) {
    case "balanced":
      return {
        maxColors: 128,
        paletteStatsMode: "diff",
        paletteDither: "bayer",
      }
    case "compact":
      return {
        maxColors: 64,
        paletteStatsMode: "diff",
        paletteDither: "bayer",
      }
    case "original":
    default:
      return {
        maxColors: 256,
        paletteStatsMode: "full",
        paletteDither: "sierra2_4a",
      }
  }
}

export function buildDefaultSettings(
  fileName: string,
  sourceWidth: number,
  sourceFrameRate: number
): GifSettings {
  return {
    fileName: createOutputFileName(fileName),
    width: clampNumber(Math.round(Math.min(sourceWidth, 480)), 160, Math.max(sourceWidth, 160)),
    fps: Math.min(12, getMaxGifFrameRate(sourceFrameRate)),
    colorPreset: "original",
    loopMode: "infinite",
    loopCount: 1,
  }
}
