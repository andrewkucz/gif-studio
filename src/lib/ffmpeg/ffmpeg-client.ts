import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile } from "@ffmpeg/util"
import type { VideoMetadata } from "@/lib/media/video-metadata"

import classWorkerURL from "@ffmpeg/ffmpeg/worker?url"
import coreURL from "@ffmpeg/core?url"
import wasmURL from "@ffmpeg/core/wasm?url"

import { clampNumber, getFileExtension, getFileTypeLabel } from "@/lib/studio-utils"

interface GenerateGifOptions {
  sourceFile: File
  outputName: string
  startTime: number
  endTime: number
  width: number
  fps: number
  paletteDither: "sierra2_4a" | "bayer"
  paletteMaxColors: number
  paletteStatsMode: "full" | "diff"
  loopCount: number
  loopMode: "infinite" | "count"
  onProgress?: (progress: number) => void
}

interface ExtractThumbnailOptions {
  sourceFile: File
  time: number
  width: number
}

const METADATA_DURATION_PATTERN = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/
const METADATA_VIDEO_SIZE_PATTERN = /(\d{2,5})x(\d{2,5})/
const METADATA_VIDEO_FPS_PATTERN = /(\d+(?:\.\d+)?)\s(?:fps|tbr)\b/
const MAX_METADATA_LOG_MESSAGES = 80
const DEFAULT_FRAME_RATE = 24

class FFmpegClient {
  private ffmpeg: FFmpeg | null = null
  private loadingPromise: Promise<FFmpeg> | null = null

  isLoaded() {
    return this.ffmpeg?.loaded ?? false
  }

  async getInstance() {
    if (this.ffmpeg?.loaded) {
      return this.ffmpeg
    }

    if (!this.loadingPromise) {
      this.loadingPromise = (async () => {
        const ffmpeg = new FFmpeg()
        await ffmpeg.load({
          coreURL,
          wasmURL,
          classWorkerURL,
        })
        this.ffmpeg = ffmpeg
        return ffmpeg
      })()
    }

    return this.loadingPromise
  }

  async generateGif({
    sourceFile,
    outputName,
    startTime,
    endTime,
    width,
    fps,
    paletteDither,
    paletteMaxColors,
    paletteStatsMode,
    loopCount,
    loopMode,
    onProgress,
  }: GenerateGifOptions) {
    const ffmpeg = await this.getInstance()
    const inputName = `input-${crypto.randomUUID()}.${sourceFile.name.split(".").at(-1) ?? "mp4"}`
    const tempOutputName = `output-${crypto.randomUUID()}.gif`
    const duration = Math.max(endTime - startTime, 0.1)

    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress?.(clampNumber(progress, 0, 1))
    }

    ffmpeg.on("progress", progressHandler)

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(sourceFile))

      const filterGraph =
        `[0:v]fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
        `[a]palettegen=max_colors=${paletteMaxColors}:stats_mode=${paletteStatsMode}[p];` +
        `[b][p]paletteuse=dither=${paletteDither}`

      const args = [
        "-ss",
        startTime.toFixed(2),
        "-t",
        duration.toFixed(2),
        "-i",
        inputName,
        "-filter_complex",
        filterGraph,
        "-an",
      ]

      const normalizedLoopCount = Math.max(1, Math.round(loopCount))
      const ffmpegLoopValue =
        loopMode === "infinite" ? 0 : normalizedLoopCount === 1 ? -1 : normalizedLoopCount - 1
      args.push("-loop", `${ffmpegLoopValue}`)

      args.push(tempOutputName)

      const exitCode = await ffmpeg.exec(args)

      if (exitCode !== 0) {
        throw new Error("FFmpeg could not generate a GIF from the selected range.")
      }

      const fileData = await ffmpeg.readFile(tempOutputName)

      if (!(fileData instanceof Uint8Array)) {
        throw new Error("FFmpeg returned an unexpected output payload.")
      }

      const safeBytes = new Uint8Array(fileData.byteLength)
      safeBytes.set(fileData)

      return new Blob([safeBytes], {
        type: "image/gif",
      })
    } finally {
      ffmpeg.off("progress", progressHandler)
      await Promise.allSettled([
        ffmpeg.deleteFile(inputName),
        ffmpeg.deleteFile(tempOutputName),
        ffmpeg.deleteFile(outputName),
      ]).then((results) => {
        results.forEach((result) => {
          if (result.status === "rejected") {
            console.error("FFmpeg cleanup error", result.reason)
          }
        })
      })
    }
  }

  async readVideoMetadata(sourceFile: File): Promise<VideoMetadata> {
    const ffmpeg = await this.getInstance()
    const extension = getFileExtension(sourceFile.name)
    const fileTypeLabel = getFileTypeLabel(sourceFile.name)
    const inputName = `metadata-${crypto.randomUUID()}.${extension || "mp4"}`
    const logMessages: string[] = []
    const logHandler = ({ message }: { message: string }) => {
      if (
        logMessages.length < MAX_METADATA_LOG_MESSAGES &&
        (message.includes("Duration:") || message.includes("Video:"))
      ) {
        logMessages.push(message)
      }
    }

    ffmpeg.on("log", logHandler)

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(sourceFile))
      const exitCode = await ffmpeg.exec([
        "-hide_banner",
        "-i",
        inputName,
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ])

      if (exitCode !== 0) {
        throw new Error(`FFmpeg could not inspect the ${fileTypeLabel} file type.`)
      }

      const combinedLog = logMessages.join("\n")
      const durationMatch = combinedLog.match(METADATA_DURATION_PATTERN)
      const videoLine = combinedLog
        .split("\n")
        .find((line) => line.includes("Video:") && METADATA_VIDEO_SIZE_PATTERN.test(line))
      const sizeMatch = videoLine?.match(METADATA_VIDEO_SIZE_PATTERN)
      const fpsMatch = videoLine?.match(METADATA_VIDEO_FPS_PATTERN)

      if (!durationMatch || !sizeMatch) {
        throw new Error(`Unable to determine metadata for the ${fileTypeLabel} file type.`)
      }

      const duration =
        Number(durationMatch[1]) * 3600 +
        Number(durationMatch[2]) * 60 +
        Number(durationMatch[3])
      const width = Number(sizeMatch[1])
      const height = Number(sizeMatch[2])
      const frameRate = fpsMatch ? Number(fpsMatch[1]) : DEFAULT_FRAME_RATE

      if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        !Number.isFinite(width) ||
        width <= 0 ||
        !Number.isFinite(height) ||
        height <= 0
      ) {
        throw new Error(
          `The ${fileTypeLabel} file metadata contains invalid dimensions or duration.`
        )
      }

      return {
        duration,
        frameRate: Number.isFinite(frameRate) && frameRate > 0 ? frameRate : DEFAULT_FRAME_RATE,
        width,
        height,
      }
    } finally {
      ffmpeg.off("log", logHandler)
      await ffmpeg.deleteFile(inputName).catch((error) => {
        console.error("FFmpeg cleanup error", error)
      })
    }
  }

  async extractThumbnail({ sourceFile, time, width }: ExtractThumbnailOptions): Promise<Blob> {
    const ffmpeg = await this.getInstance()
    const extension = getFileExtension(sourceFile.name)
    const inputName = `thumb-${crypto.randomUUID()}.${extension || "mp4"}`
    const outputName = `thumb-${crypto.randomUUID()}.jpg`

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(sourceFile))
      const exitCode = await ffmpeg.exec([
        "-ss",
        Math.max(time, 0).toFixed(2),
        "-i",
        inputName,
        "-frames:v",
        "1",
        "-vf",
        `scale=${Math.max(Math.round(width), 1)}:-1:flags=lanczos`,
        "-q:v",
        "2",
        outputName,
      ])

      if (exitCode !== 0) {
        throw new Error("FFmpeg could not generate a timeline thumbnail for this video.")
      }

      const fileData = await ffmpeg.readFile(outputName)
      if (!(fileData instanceof Uint8Array)) {
        throw new Error("FFmpeg returned an unexpected thumbnail payload.")
      }

      const safeBytes = new Uint8Array(fileData.byteLength)
      safeBytes.set(fileData)

      return new Blob([safeBytes], {
        type: "image/jpeg",
      })
    } finally {
      await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]).then(
        (results) => {
          results.forEach((result) => {
            if (result.status === "rejected") {
              console.error("FFmpeg cleanup error", result.reason)
            }
          })
        }
      )
    }
  }

}

export const ffmpegClient = new FFmpegClient()
