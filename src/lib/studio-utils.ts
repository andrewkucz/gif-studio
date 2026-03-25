import type { GifColorPreset, GifSettings, GifSizeMode, GifSizeUnit } from "@/state/studio-store"

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

export function getFileTypeLabel(name: string) {
  const extension = getFileExtension(name)
  return extension ? extension.toUpperCase() : "Unknown"
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
  description?: string
}

export const GIF_CUSTOM_COLOR_MIN = 2
export const GIF_CUSTOM_COLOR_MAX = 256

interface GifColorPresetConfig {
  maxColors: number
  paletteStatsMode: "full" | "diff"
  paletteDither: "sierra2_4a" | "bayer"
}

interface GifSizeEstimateOptions {
  width: number
  height: number
  duration: number
  fps: number
  sourceFrameRate?: number
  colorPreset: GifColorPreset
  customColorCount?: number
  loopMode: "infinite" | "count"
  loopCount: number
  sizeMode: GifSizeMode
  sizeUnit: GifSizeUnit
}

export const gifColorPresetOptions: GifColorPresetOption[] = [
  {
    value: "original",
    label: "Original",
    description: "Best color fidelity.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Balanced quality.",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Smaller files.",
  },
  {
    value: "custom",
    label: "Custom",
  },
]

export function getGifColorPresetConfig(
  colorPreset: GifColorPreset,
  customColorCount = 128
): GifColorPresetConfig {
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
    case "custom":
      return {
        maxColors: clampNumber(
          Math.round(customColorCount),
          GIF_CUSTOM_COLOR_MIN,
          GIF_CUSTOM_COLOR_MAX
        ),
        paletteStatsMode: "full",
        paletteDither: "sierra2_4a",
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

export function getGifOutputWidth(
  sourceWidth: number,
  sizeMode: GifSizeMode,
  sizeUnit: GifSizeUnit,
  customWidth: number
) {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) {
    return Math.max(1, Math.round(customWidth))
  }

  if (sizeMode === "original") {
    return Math.round(sourceWidth)
  }

  if (sizeUnit === "percent") {
    return Math.max(1, Math.round((sourceWidth * customWidth) / 100))
  }

  return Math.max(1, Math.round(customWidth))
}

export function convertGifCustomSizeValue(
  sourceWidth: number,
  value: number,
  fromUnit: GifSizeUnit,
  toUnit: GifSizeUnit
) {
  const normalizedValue = Math.max(1, value)

  if (
    fromUnit === toUnit ||
    !Number.isFinite(sourceWidth) ||
    sourceWidth <= 0
  ) {
    return Math.round(normalizedValue)
  }

  if (fromUnit === "pixels" && toUnit === "percent") {
    return Math.max(1, Math.round((normalizedValue / sourceWidth) * 100))
  }

  return Math.max(1, Math.round((normalizedValue / 100) * sourceWidth))
}

export function getScaledHeight(sourceWidth: number, sourceHeight: number, targetWidth: number) {
  if (
    !Number.isFinite(sourceWidth) ||
    sourceWidth <= 0 ||
    !Number.isFinite(sourceHeight) ||
    sourceHeight <= 0 ||
    !Number.isFinite(targetWidth) ||
    targetWidth <= 0
  ) {
    return 0
  }

  return Math.max(1, Math.round((targetWidth * sourceHeight) / sourceWidth))
}

export function estimateGifSizeBytes({
  width,
  height,
  duration,
  fps,
  sourceFrameRate = fps,
  colorPreset,
  customColorCount = 128,
  loopMode,
  loopCount,
  sizeMode,
  sizeUnit,
}: GifSizeEstimateOptions) {
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(fps) ||
    fps <= 0
  ) {
    return 0
  }

  const frameCount = Math.max(1, Math.round(duration * fps))
  const pixelCountPerFrame = width * height
  const colorConfig = getGifColorPresetConfig(colorPreset, customColorCount)
  const colorFactor = 0.95 + colorConfig.maxColors / 320
  const ditherFactor = colorConfig.paletteDither === "sierra2_4a" ? 1.22 : 1.08
  const statsFactor = colorConfig.paletteStatsMode === "full" ? 1.18 : 1.06
  const motionFactor = 1.05 + Math.min(fps, 30) / 18
  const sourceMotionFactor =
    Number.isFinite(sourceFrameRate) && sourceFrameRate > 0
      ? 1 + Math.min(sourceFrameRate, 60) / 120
      : 1
  const sizeModeFactor = sizeMode === "custom" ? 1.08 : 1.02
  const sizeUnitFactor = sizeUnit === "percent" ? 1.06 : 1.03
  const loopMetadataFactor = loopMode === "infinite" ? 1.03 : 1 + Math.min(loopCount, 25) / 500
  const compressionRatio =
    0.14 *
    colorFactor *
    ditherFactor *
    statsFactor *
    motionFactor *
    sourceMotionFactor *
    sizeModeFactor *
    sizeUnitFactor *
    loopMetadataFactor
  const framePayloadBytes = pixelCountPerFrame * frameCount * compressionRatio
  const paletteOverheadBytes = frameCount * colorConfig.maxColors * 3 * 0.7
  const containerOverheadBytes = 8192 + frameCount * 96 + colorConfig.maxColors * 24

  return Math.max(
    24 * 1024,
    Math.round(framePayloadBytes + paletteOverheadBytes + containerOverheadBytes)
  )
}

export interface BuildFfmpegCommandOptions {
  startTime: number
  endTime: number
  width: number
  fps: number
  paletteDither: "sierra2_4a" | "bayer"
  paletteMaxColors: number
  paletteStatsMode: "full" | "diff"
  loopMode: "infinite" | "count"
  loopCount: number
  inputFileName?: string
  outputFileName?: string
}

export function buildFfmpegCommand({
  startTime,
  endTime,
  width,
  fps,
  paletteDither,
  paletteMaxColors,
  paletteStatsMode,
  loopMode,
  loopCount,
  inputFileName = "input.mp4",
  outputFileName = "output.gif",
}: BuildFfmpegCommandOptions): string {
  const duration = Math.max(endTime - startTime, 0.1)
  const filterGraph =
    `[0:v]fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=${paletteMaxColors}:stats_mode=${paletteStatsMode}[p];` +
    `[b][p]paletteuse=dither=${paletteDither}`
  const normalizedLoopCount = Math.max(1, Math.round(loopCount))
  const ffmpegLoopValue =
    loopMode === "infinite" ? 0 : normalizedLoopCount === 1 ? -1 : normalizedLoopCount - 1

  return [
    "ffmpeg",
    "-ss", startTime.toFixed(2),
    "-t", duration.toFixed(2),
    "-i", inputFileName,
    "-filter_complex", `"${filterGraph}"`,
    "-an",
    "-loop", `${ffmpegLoopValue}`,
    outputFileName,
  ].join(" ")
}

export function buildDefaultSettings(
  fileName: string,
  sourceWidth: number,
  sourceFrameRate: number
): GifSettings {
  return {
    fileName: createOutputFileName(fileName),
    sizeMode: "original",
    sizeUnit: "pixels",
    width: clampNumber(Math.round(Math.min(sourceWidth, 480)), 160, Math.max(sourceWidth, 160)),
    fps: Math.min(10, getMaxGifFrameRate(sourceFrameRate)),
    colorPreset: "balanced",
    customColorCount: 128,
    loopMode: "infinite",
    loopCount: 1,
  }
}
