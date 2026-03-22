import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CogIcon,
  HardDriveDownloadIcon,
  PlayCircleIcon,
  ScissorsIcon,
  WandSparklesIcon,
} from "lucide-react"

import { ExportPanel } from "@/features/export/components/export-panel"
import { VideoPlayer } from "@/features/player/components/video-player"
import { GifSettingsForm } from "@/features/settings/components/gif-settings-form"
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
import { Separator } from "@/components/ui/separator"
import { ffmpegClient } from "@/lib/ffmpeg/ffmpeg-client"
import { createTimelineThumbnails } from "@/lib/media/thumbnail-service"
import { probePlayableVideo } from "@/lib/media/video-metadata"
import { opfsRepository } from "@/lib/opfs/opfs-repository"
import {
  buildDefaultSettings,
  clampNumber,
  createOutputFileName,
  formatBytes,
  formatDuration,
  getTrimDuration,
  getFileExtension,
} from "@/lib/studio-utils"
import { useStudioStore } from "@/state/studio-store"

function App() {
  const source = useStudioStore((state) => state.source)
  const thumbnails = useStudioStore((state) => state.thumbnails)
  const trimWindow = useStudioStore((state) => state.trimWindow)
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

  const selectionDuration = useMemo(() => getTrimDuration(trimWindow), [trimWindow])

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
      if (state.source) {
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
          sourceUrl: source.previewUrl,
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

  const handleVideoSelected = useCallback(
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
        if (currentState.source) {
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
        const metadata = await probePlayableVideo(storedFile)

        if (!metadata) {
          throw new Error(
            "This browser cannot play that video format directly. Import a video the browser video element supports, such as MP4, MOV, or WebM."
          )
        }

        const previewUrl = URL.createObjectURL(storedFile)
        const defaultTrimEnd =
          metadata.duration > 8 ? 6 : clampNumber(metadata.duration, 0.1, metadata.duration)

        setSource({
          id: assetId,
          name: file.name,
          opfsPath,
          previewUrl,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          size: file.size,
        })
        setTrimWindow([0, defaultTrimEnd])
        setRangeInputMode("start-length")
        setDurationLocked(false)
        setCurrentTime(0)
        setSettings(buildDefaultSettings(file.name, metadata.width))
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
      setThumbnails,
      setTrimWindow,
    ]
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

      const blob = await ffmpegClient.generateGif({
        sourceFile,
        outputName,
        startTime: trimWindow[0],
        endTime: trimWindow[1],
        width: settings.width,
        fps: settings.fps,
        colors: settings.colors,
        loop: settings.loop,
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
      const storedOutput = await opfsRepository.readFile(storedPath)
      const nextOutputUrl = URL.createObjectURL(storedOutput)

      const previousOutput = useStudioStore.getState().output
      if (previousOutput) {
        URL.revokeObjectURL(previousOutput.url)
      }

      setOutput({
        fileName: outputName,
        opfsPath: storedPath,
        size: blob.size,
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
    settings.colors,
    settings.fileName,
    settings.fps,
    settings.loop,
    settings.width,
    source,
    trimWindow,
  ])

  const storagePercent =
    storageEstimate && storageEstimate.quota > 0
      ? Math.round((storageEstimate.usage / storageEstimate.quota) * 100)
      : null

  const controlsPanel = (
    <>
      <GifSettingsForm
        duration={selectionDuration}
        settings={settings}
        source={source}
        trimWindow={trimWindow}
        onChange={setSettings}
      />

      <ExportPanel
        canGenerate={canGenerate}
        errorMessage={errorMessage}
        output={output}
        phase={exportPhase}
        progress={exportProgress}
        selectionDuration={selectionDuration}
        onGenerate={handleGenerate}
      />
    </>
  )

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),transparent_55%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="absolute right-4 top-6 z-10 md:right-6 lg:right-8">
          <Dialog>
            <DialogTrigger asChild>
              <Button aria-label="Open studio settings" size="icon" variant="outline">
                <CogIcon />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Studio settings</DialogTitle>
                <DialogDescription>
                  Local storage and runtime details for this browser-based studio.
                </DialogDescription>
              </DialogHeader>

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
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <HardDriveDownloadIcon data-icon="inline-start" />
              Fully local
            </Badge>
            <Badge variant="secondary">
              <WandSparklesIcon data-icon="inline-start" />
              FFmpeg.wasm
            </Badge>
            <Badge variant="outline">
              <PlayCircleIcon data-icon="inline-start" />
              OPFS-backed
            </Badge>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                GIF Studio
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
                Upload a video, trim the exact window you want, preview timeline thumbnails,
                and export a GIF without sending your file to a server.
              </p>
            </div>

            {source ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{source.width}×{source.height}</Badge>
                <Badge variant="outline">{formatDuration(source.duration)} source</Badge>
                <Badge variant="outline">{formatBytes(source.size)}</Badge>
              </div>
            ) : null}
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
              {controlsPanel}
            </aside>

            <section className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-1">
              <VideoPlayer
                currentTime={currentTime}
                src={source.previewUrl}
                onTimeChange={setCurrentTime}
              />

              <StudioTimeline
                currentTime={currentTime}
                duration={source.duration}
                frameRate={settings.fps}
                inputMode={rangeInputMode}
                isDurationLocked={isDurationLocked}
                isLoading={isGeneratingThumbnails}
                thumbnails={thumbnails}
                trimWindow={trimWindow}
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
            />
          </main>
        )}

        {source ? (
          <>
            <Separator />
            <footer className="flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
              <p>
                Active clip: <span className="font-medium text-foreground">{source.name}</span>
              </p>
              <p>
                Selected range:{" "}
                <span className="font-medium text-foreground">
                  {formatDuration(trimWindow[0])} → {formatDuration(trimWindow[1])}
                </span>
              </p>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default App
