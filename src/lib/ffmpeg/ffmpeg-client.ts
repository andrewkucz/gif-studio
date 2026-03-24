import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile } from "@ffmpeg/util"

import classWorkerURL from "@ffmpeg/ffmpeg/worker?url"
import coreURL from "@ffmpeg/core?url"
import wasmURL from "@ffmpeg/core/wasm?url"

import { clampNumber } from "@/lib/studio-utils"

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

}

export const ffmpegClient = new FFmpegClient()
