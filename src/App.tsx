import { useCallback, useEffect, useMemo, useState } from "react"
import {
  InfoIcon,
  PlayCircleIcon,
  ScissorsIcon,
} from "lucide-react"
import packageJson from "../package.json"

import { ExportPanel } from "@/features/export/components/export-panel"
import { VideoPlayer } from "@/features/player/components/video-player"
import { StudioTimeline } from "@/features/timeline/components/timeline"
import { UploadDropzone } from "@/features/upload/components/upload-dropzone"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ffmpegClient } from "@/lib/ffmpeg/ffmpeg-client"
import { createTimelineThumbnails } from "@/lib/media/thumbnail-service"
import { probePlayableVideo } from "@/lib/media/video-metadata"
import { opfsRepository } from "@/lib/opfs/opfs-repository"
import {
  buildDefaultSettings,
  clampNumber,
  createOutputFileName,
  formatBytes,
  getFileTypeLabel,
  getGifColorPresetConfig,
  getMaxGifFrameRate,
  getGifOutputWidth,
  getTrimDuration,
  getFileExtension,
} from "@/lib/studio-utils"
import { useStudioStore } from "@/state/studio-store"

function getRemoteVideoName(url: string, contentType: string | null) {
  const pathname = new URL(url).pathname
  const pathSegment = pathname.split("/").filter(Boolean).at(-1)

  if (pathSegment) {
    return decodeURIComponent(pathSegment)
  }

  const normalizedType = contentType?.split(";")[0]?.trim().toLowerCase()
  if (normalizedType === "video/webm") {
    return "remote-video.webm"
  }
  if (normalizedType === "video/quicktime") {
    return "remote-video.mov"
  }
  if (normalizedType === "video/mp4") {
    return "remote-video.mp4"
  }

  return "remote-video.mp4"
}

function App() {
  const source = useStudioStore((state) => state.source)
  const thumbnails = useStudioStore((state) => state.thumbnails)
  const trimWindow = useStudioStore((state) => state.trimWindow)
  const isTrimEnabled = useStudioStore((state) => state.isTrimEnabled)
  const rangeInputMode = useStudioStore((state) => state.rangeInputMode)
  const isDurationLocked = useStudioStore((state) => state.isDurationLocked)
  const currentTime = useStudioStore((state) => state.currentTime)
  const settings = useStudioStore((state) => state.settings)
  const output = useStudioStore((state) => state.output)
  const exportPhase = useStudioStore((state) => state.exportPhase)
  const exportProgress = useStudioStore((state) => state.exportProgress)
  const errorMessage = useStudioStore((state) => state.errorMessage)
  const isImporting = useStudioStore((state) => state.isImporting)
  const importStatusMessage = useStudioStore((state) => state.importStatusMessage)
  const isGeneratingThumbnails = useStudioStore((state) => state.isGeneratingThumbnails)
  const storageEstimate = useStudioStore((state) => state.storageEstimate)
  const setSource = useStudioStore((state) => state.setSource)
  const setCurrentTime = useStudioStore((state) => state.setCurrentTime)
  const setTrimWindow = useStudioStore((state) => state.setTrimWindow)
  const setTrimEnabled = useStudioStore((state) => state.setTrimEnabled)
  const setRangeInputMode = useStudioStore((state) => state.setRangeInputMode)
  const setDurationLocked = useStudioStore((state) => state.setDurationLocked)
  const setSettings = useStudioStore((state) => state.setSettings)
  const setThumbnails = useStudioStore((state) => state.setThumbnails)
  const setThumbnailState = useStudioStore((state) => state.setThumbnailState)
  const setImporting = useStudioStore((state) => state.setImporting)
  const setImportStatusMessage = useStudioStore((state) => state.setImportStatusMessage)
  const setExportState = useStudioStore((state) => state.setExportState)
  const setOutput = useStudioStore((state) => state.setOutput)
  const setError = useStudioStore((state) => state.setError)
  const setStorageEstimate = useStudioStore((state) => state.setStorageEstimate)
  const clearError = useStudioStore((state) => state.clearError)

  const [opfsSupported, setOpfsSupported] = useState(true)

  const activeTrimWindow = useMemo<[number, number]>(
    () => (source && !isTrimEnabled ? [0, source.duration] : trimWindow),
    [isTrimEnabled, source, trimWindow]
  )
  const selectionDuration = useMemo(
    () => (source ? (isTrimEnabled ? getTrimDuration(trimWindow) : source.duration) : 0),
    [isTrimEnabled, source, trimWindow]
  )

  const canGenerate = source !== null && selectionDuration > 0.1 && exportPhase !== "loading"

  const refreshStorageEstimate = useCallback(async () => {
    try {
      const estimate = await opfsRepository.getEstimate()
      setStorageEstimate({
        usage: estimate.usage ?? 0,
        quota: estimate.quota ?? 0,
      })
    } catch (error) {
      console.error("Unable to read storage estimate", error)
    }
  }, [setStorageEstimate])

  useEffect(() => {
    setOpfsSupported(opfsRepository.isSupported())
    void refreshStorageEstimate()
  }, [refreshStorageEstimate])

  useEffect(() => {
    return () => {
      const state = useStudioStore.getState()
      if (state.source?.previewUrl) {
        URL.revokeObjectURL(state.source.previewUrl)
      }
      for (const thumbnail of state.thumbnails) {
        URL.revokeObjectURL(thumbnail.url)
      }
      if (state.output) {
        URL.revokeObjectURL(state.output.url)
      }
    }
  }, [])

  useEffect(() => {
    if (!source) {
      return
    }

    let isCancelled = false

    const loadThumbnails = async () => {
      setThumbnailState(true)
      try {
        const sourceFile = await opfsRepository.readFile(source.opfsPath)
        const nextThumbnails = await createTimelineThumbnails({
          assetId: source.id,
          sourceFile,
          sourceHeight: source.height,
          sourceUrl: source.isPreviewSupported ? source.previewUrl : null,
          sourceWidth: source.width,
          duration: source.duration,
          count: 10,
        })

        if (isCancelled) {
          nextThumbnails.forEach((thumbnail) => URL.revokeObjectURL(thumbnail.url))
          return
        }

        const previousThumbnails = useStudioStore.getState().thumbnails
        previousThumbnails.forEach((thumbnail) => URL.revokeObjectURL(thumbnail.url))
        setThumbnails(nextThumbnails)
      } catch (error) {
        if (!isCancelled) {
          setError(
            error instanceof Error ? error.message : "Unable to generate timeline thumbnails."
          )
        }
      } finally {
        if (!isCancelled) {
          setThumbnailState(false)
        }
      }
    }

    void loadThumbnails()

    return () => {
      isCancelled = true
    }
  }, [setError, setThumbnailState, setThumbnails, source])

  const importVideoFile = useCallback(
    async (file: File) => {
      clearError()
      setImporting(true)
      setImportStatusMessage("Saving video locally...")

      try {
        if (!opfsRepository.isSupported()) {
          throw new Error("Your browser does not support OPFS, which this app needs for local caching.")
        }

        await opfsRepository.ensureReady()
        setImportStatusMessage("Checking browser preview support...")

        const currentState = useStudioStore.getState()
        if (currentState.source?.previewUrl) {
          URL.revokeObjectURL(currentState.source.previewUrl)
        }
        currentState.thumbnails.forEach((thumbnail) => URL.revokeObjectURL(thumbnail.url))
        if (currentState.output) {
          URL.revokeObjectURL(currentState.output.url)
        }

        const assetId = crypto.randomUUID()
        const extension = getFileExtension(file.name)
        const sourceFileName = `${assetId}.${extension || "mp4"}`
        const opfsPath = await opfsRepository.writeFile("sources", sourceFileName, file)
        const storedFile = await opfsRepository.readFile(opfsPath)
        let metadata = await probePlayableVideo(storedFile)
        const isPreviewSupported = metadata !== null

        if (!metadata) {
          setImportStatusMessage("Reading video details with FFmpeg...")
          metadata = await ffmpegClient.readVideoMetadata(storedFile)
        }

        const previewUrl = isPreviewSupported ? URL.createObjectURL(storedFile) : null
        const shouldEnableTrim = metadata.duration > 10
        const defaultTrimEnd = shouldEnableTrim
          ? 6
          : clampNumber(metadata.duration, 0.1, metadata.duration)

        setSource({
          id: assetId,
          name: file.name,
          opfsPath,
          fileTypeLabel: getFileTypeLabel(file.name),
          isPreviewSupported,
          previewUrl,
          duration: metadata.duration,
          frameRate: metadata.frameRate,
          width: metadata.width,
          height: metadata.height,
          size: file.size,
        })
        setTrimWindow([0, defaultTrimEnd])
        setTrimEnabled(shouldEnableTrim)
        setRangeInputMode("start-length")
        setDurationLocked(false)
        setCurrentTime(0)
        setSettings(buildDefaultSettings(file.name, metadata.width, metadata.frameRate))
        setThumbnails([])
        setOutput(null)
        setExportState({ phase: "idle", progress: 0 })
        await refreshStorageEstimate()
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unable to import that video.")
      } finally {
        setImportStatusMessage(null)
        setImporting(false)
      }
    },
    [
      clearError,
      refreshStorageEstimate,
      setCurrentTime,
      setDurationLocked,
      setError,
      setExportState,
      setImporting,
      setImportStatusMessage,
      setOutput,
      setRangeInputMode,
      setSettings,
      setSource,
      setTrimEnabled,
      setThumbnails,
      setTrimWindow,
    ]
  )

  const handleVideoSelected = useCallback(
    async (file: File) => {
      await importVideoFile(file)
    },
    [importVideoFile]
  )

  const handleVideoUrlSelected = useCallback(
    async (rawUrl: string) => {
      const trimmedUrl = rawUrl.trim()

      clearError()
      setImporting(true)
      setImportStatusMessage("Downloading video from URL...")

      try {
        const parsedUrl = new URL(trimmedUrl)
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error("Enter a direct http:// or https:// video URL.")
        }

        let response: Response
        try {
          response = await fetch(parsedUrl.toString())
        } catch {
          throw new Error(
            "Unable to download that video URL. Because this app runs entirely in your browser, the remote server must allow cross-origin requests (CORS). Try a direct video file URL that sends Access-Control-Allow-Origin, or download the video locally first."
          )
        }

        if (!response.ok) {
          throw new Error(
            `Unable to download that video URL (${response.status} ${response.statusText || "request failed"}).`
          )
        }

        const contentType = response.headers.get("content-type")
        if (contentType?.toLowerCase().startsWith("text/html")) {
          throw new Error(
            "That URL returned an HTML page instead of a video file. Use a direct video file URL."
          )
        }

        const downloadedBlob = await response.blob()
        if (downloadedBlob.size === 0) {
          throw new Error("The downloaded response was empty. Use a direct video file URL.")
        }

        const fileName = getRemoteVideoName(parsedUrl.toString(), downloadedBlob.type || contentType)
        const file = new File([downloadedBlob], fileName, {
          type: downloadedBlob.type || contentType || "video/mp4",
        })

        await importVideoFile(file)
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unable to import that video URL.")
        setImportStatusMessage(null)
        setImporting(false)
      }
    },
    [clearError, importVideoFile, setError, setImportStatusMessage, setImporting]
  )

  const handleGenerate = useCallback(async () => {
    if (!source) {
      return
    }

    clearError()
    setExportState({ phase: "loading", progress: 4 })

    try {
      const sourceFile = await opfsRepository.readFile(source.opfsPath)
      const outputName = createOutputFileName(settings.fileName)
      const cappedFps = clampNumber(settings.fps, 1, getMaxGifFrameRate(source.frameRate))
      const outputWidth = getGifOutputWidth(
        source.width,
        settings.sizeMode,
        settings.sizeUnit,
        settings.width
      )
      const colorPresetConfig = getGifColorPresetConfig(
        settings.colorPreset,
        settings.customColorCount
      )

      const blob = await ffmpegClient.generateGif({
        sourceFile,
        outputName,
        startTime: activeTrimWindow[0],
        endTime: activeTrimWindow[1],
        width: outputWidth,
        fps: cappedFps,
        paletteDither: colorPresetConfig.paletteDither,
        paletteMaxColors: colorPresetConfig.maxColors,
        paletteStatsMode: colorPresetConfig.paletteStatsMode,
        loopCount: settings.loopCount,
        loopMode: settings.loopMode,
        onProgress: (progress) => {
          setExportState({
            phase: "loading",
            progress: clampNumber(Math.round(progress * 100), 8, 96),
          })
        },
      })

      setExportState({ phase: "saving", progress: 98 })

      const storedPath = await opfsRepository.writeFile(
        "exports",
        `${source.id}-${outputName}`,
        blob
      )
      const namedOutputFile = new File([blob], outputName, { type: "image/gif" })
      const nextOutputUrl = URL.createObjectURL(namedOutputFile)

      const previousOutput = useStudioStore.getState().output
      if (previousOutput) {
        URL.revokeObjectURL(previousOutput.url)
      }

      setOutput({
        fileName: outputName,
        opfsPath: storedPath,
        size: namedOutputFile.size,
        url: nextOutputUrl,
      })
      setExportState({ phase: "done", progress: 100 })
      await refreshStorageEstimate()
    } catch (error) {
      setExportState({ phase: "error", progress: 0 })
      setError(error instanceof Error ? error.message : "GIF generation failed.")
    }
  }, [
    clearError,
    refreshStorageEstimate,
    setError,
    setExportState,
    setOutput,
    settings.colorPreset,
    settings.customColorCount,
    settings.fileName,
    settings.fps,
    settings.loopCount,
    settings.loopMode,
    settings.sizeMode,
    settings.sizeUnit,
    settings.width,
    source,
    activeTrimWindow,
  ])

  const storagePercent =
    storageEstimate && storageEstimate.quota > 0
      ? Math.round((storageEstimate.usage / storageEstimate.quota) * 100)
      : null

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),transparent_55%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="absolute right-4 top-6 z-10 md:right-6 lg:right-8">
          <Dialog>
            <DialogTrigger asChild>
              <Button aria-label="Open about dialog" size="icon" variant="outline">
                <InfoIcon />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>About GIF Studio</DialogTitle>
                <DialogDescription>
                  Browser-local processing, storage, and runtime details for this app.
                </DialogDescription>
              </DialogHeader>

              <Card size="sm" className="shadow-none">
                <CardHeader>
                  <CardTitle>Project info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Author</span>
                    <span className="font-medium text-foreground">Andrew Kuczynski</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">GitHub</span>
                    <a
                      className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
                      href="https://github.com/andrewkucz/gif-studio"
                      rel="noreferrer"
                      target="_blank"
                    >
                      github.com/andrewkucz/gif-studio
                    </a>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-medium text-foreground">v{packageJson.version}</span>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm" className="shadow-none">
                <CardHeader>
                  <CardTitle>Local storage status</CardTitle>
                  <CardDescription>
                    Source files, thumbnail caches, and GIF outputs stay inside this origin.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">FFmpeg engine</span>
                    <Badge variant={ffmpegClient.isLoaded() ? "secondary" : "outline"}>
                      {ffmpegClient.isLoaded() ? "Ready" : "Lazy load"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Storage usage</span>
                    <span className="font-medium text-foreground">
                      {storageEstimate ? formatBytes(storageEstimate.usage) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Quota</span>
                    <span className="font-medium text-foreground">
                      {storageEstimate ? formatBytes(storageEstimate.quota) : "—"}
                    </span>
                  </div>
                  {storagePercent !== null ? (
                    <p className="text-xs text-muted-foreground">
                      Approx. {storagePercent}% of your origin storage quota is currently in
                      use.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </DialogContent>
          </Dialog>
        </div>

        <header className="flex flex-col gap-4">
          <div className="space-y-2">
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              GIF Tree
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
              Fully local GIF creation and trimming studio running in your browser.
            </p>
          </div>
        </header>

        {isImporting && importStatusMessage ? (
          <Alert>
            <PlayCircleIcon />
            <AlertTitle>Preparing local media</AlertTitle>
            <AlertDescription>{importStatusMessage}</AlertDescription>
          </Alert>
        ) : null}

        {!source && errorMessage ? (
          <Alert variant="destructive">
            <ScissorsIcon />
            <AlertTitle>Import issue</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {!opfsSupported ? (
          <Alert variant="destructive">
            <ScissorsIcon />
            <AlertTitle>OPFS is not available in this browser.</AlertTitle>
            <AlertDescription>
              This MVP depends on the Origin Private File System for cached thumbnails and
              generated exports. Try a current Chromium-based browser.
            </AlertDescription>
          </Alert>
        ) : null}

        {source ? (
          <main className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_24rem]">
            <aside className="flex min-w-0 flex-col gap-6 self-start xl:col-start-2 xl:row-start-1 xl:sticky xl:top-6">
              <ExportPanel
                canGenerate={canGenerate}
                errorMessage={errorMessage}
                output={output}
                phase={exportPhase}
                progress={exportProgress}
                settings={settings}
                selectionDuration={selectionDuration}
                selectionStart={activeTrimWindow[0]}
                selectionEnd={activeTrimWindow[1]}
                source={source}
                onGenerate={handleGenerate}
                onSettingsChange={setSettings}
              />
            </aside>

            <section className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-1">
              <VideoPlayer
                currentTime={currentTime}
                source={source}
                onTimeChange={setCurrentTime}
              />

              <StudioTimeline
                currentTime={currentTime}
                duration={source.duration}
                frameRate={source.frameRate}
                inputMode={rangeInputMode}
                isTrimEnabled={isTrimEnabled}
                isDurationLocked={isDurationLocked}
                isLoading={isGeneratingThumbnails}
                thumbnails={thumbnails}
                trimWindow={trimWindow}
                onTrimEnabledChange={setTrimEnabled}
                onDurationLockChange={setDurationLocked}
                onInputModeChange={setRangeInputMode}
                onSeek={setCurrentTime}
                onTrimChange={setTrimWindow}
              />
            </section>
          </main>
        ) : (
          <main className="flex min-w-0 flex-col gap-6">
            <UploadDropzone
              disabled={isImporting}
              onSelect={handleVideoSelected}
              onSelectUrl={handleVideoUrlSelected}
            />
          </main>
        )}

        <footer className="mt-auto border-t border-border/60 pt-4 text-xs text-muted-foreground">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p>Runs fully in your browser using OPFS and FFmpeg.wasm.</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
                href="https://github.com/ffmpegwasm/ffmpeg.wasm"
                rel="noreferrer"
                target="_blank"
              >
                FFmpeg.wasm
              </a>
              <a
                className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
                href="https://github.com/andrewkucz/gif-studio"
                rel="noreferrer"
                target="_blank"
              >
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
