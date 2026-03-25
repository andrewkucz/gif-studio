import { useEffect, useRef, type SyntheticEvent } from "react"
import { LoaderCircleIcon, MonitorOffIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { formatBytes, formatDuration, formatFrameRate } from "@/lib/studio-utils"
import type { SourceVideo } from "@/state/studio-store"

export interface TrimPlaybackRequest {
  requestId: number
  start: number
  end: number
  loop: boolean
}

interface VideoPlayerProps {
  currentTime: number
  isGeneratingPreviewProxy: boolean
  isTrimPlaybackLoopEnabled: boolean
  previewProxyProgress: number
  source: SourceVideo
  trimPlaybackRequest: TrimPlaybackRequest | null
  onGeneratePreviewProxy: () => void
  onTimeChange: (value: number) => void
}

export function VideoPlayer({
  currentTime,
  isGeneratingPreviewProxy,
  isTrimPlaybackLoopEnabled,
  previewProxyProgress,
  source,
  trimPlaybackRequest,
  onGeneratePreviewProxy,
  onTimeChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trimPlaybackRef = useRef<TrimPlaybackRequest | null>(null)
  const {
    fileTypeLabel,
    isNativePreviewSupported,
    name,
    previewProxyOpfsPath,
    src,
    duration,
    frameRate,
    width,
    height,
    size,
  } = {
    fileTypeLabel: source.fileTypeLabel,
    isNativePreviewSupported: source.isNativePreviewSupported,
    name: source.name,
    previewProxyOpfsPath: source.previewProxyOpfsPath,
    src: source.previewUrl,
    duration: source.duration,
    frameRate: source.frameRate,
    width: source.width,
    height: source.height,
    size: source.size,
  }

  useEffect(() => {
    const video = videoRef.current

    if (!video || !src) {
      return
    }

    if (Math.abs(video.currentTime - currentTime) > 0.15) {
      video.currentTime = currentTime
    }
  }, [currentTime, src])

  useEffect(() => {
    trimPlaybackRef.current = null
  }, [src])

  useEffect(() => {
    const video = videoRef.current

    if (!trimPlaybackRequest || !video || !src) {
      return
    }

    trimPlaybackRef.current = trimPlaybackRequest
    video.pause()
    video.currentTime = trimPlaybackRequest.start

    void video.play().catch(() => {
      trimPlaybackRef.current = null
    })
  }, [trimPlaybackRequest, src])

  const handleTimeUpdate = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    const activeTrimPlayback = trimPlaybackRef.current

    if (activeTrimPlayback) {
      const playbackEnd = Math.max(activeTrimPlayback.end - 0.05, activeTrimPlayback.start)

      if (video.currentTime >= playbackEnd) {
        if (activeTrimPlayback.loop && isTrimPlaybackLoopEnabled) {
          video.currentTime = activeTrimPlayback.start
          onTimeChange(activeTrimPlayback.start)
          void video.play().catch(() => {
            trimPlaybackRef.current = null
          })
          return
        }

        trimPlaybackRef.current = null
        video.pause()
        video.currentTime = activeTrimPlayback.end
        onTimeChange(activeTrimPlayback.end)
        return
      }
    }

    onTimeChange(video.currentTime)
  }

  return (
    <Card className="border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader>
        <CardTitle>Video input</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
              Source file
            </p>
            <p className="mt-1 truncate text-sm font-medium text-foreground" title={name}>
              {name}
            </p>
          </div>

          <div className="flex flex-wrap self-end justify-end gap-2">
            <Badge variant="outline">{width}×{height}</Badge>
            <Badge variant="outline">{formatDuration(duration)} length</Badge>
            <Badge variant="outline">{formatFrameRate(frameRate)}</Badge>
            <Badge variant="outline">{formatBytes(size)}</Badge>
            <Badge variant="outline">{fileTypeLabel}</Badge>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-black">
          {src ? (
            <video
              ref={videoRef}
              className="aspect-video w-full"
              controls
              playsInline
              preload="metadata"
              src={src}
              onTimeUpdate={handleTimeUpdate}
            />
          ) : (
            <div className="grid aspect-video place-items-center p-6">
              <Empty className="max-w-xl border-white/10 bg-white/5">
                <div className="grid size-12 place-content-center rounded-full border border-white/10 bg-white/5 text-white">
                  <MonitorOffIcon className="size-5" />
                </div>
                <EmptyHeader>
                  <EmptyTitle className="text-white">Live preview unavailable</EmptyTitle>
                  <EmptyDescription className="text-white/70">
                    Live preview is not currently supported for the {fileTypeLabel} file type.
                    {previewProxyOpfsPath
                      ? " A converted preview is available now."
                      : " Timeline thumbnails and final export still work from the original source."}
                  </EmptyDescription>
                </EmptyHeader>
                {!isNativePreviewSupported && !previewProxyOpfsPath ? (
                  <div className="w-full space-y-3">
                    <Button
                      disabled={isGeneratingPreviewProxy}
                      type="button"
                      variant="secondary"
                      onClick={onGeneratePreviewProxy}
                    >
                      {isGeneratingPreviewProxy ? (
                        <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                      ) : null}
                      {isGeneratingPreviewProxy ? "Converting preview…" : "Convert video for preview"}
                    </Button>
                    {isGeneratingPreviewProxy ? (
                      <div className="w-full space-y-1.5">
                        <Progress
                          aria-label="Preview conversion progress"
                          className="h-2 bg-white/10 [&_[data-slot=progress-indicator]]:bg-white"
                          value={previewProxyProgress}
                        />
                        <p className="text-right text-[11px] text-white/60">
                          {previewProxyProgress}%
                        </p>
                      </div>
                    ) : null}
                    <p className="text-center text-xs text-white/60">
                      {isGeneratingPreviewProxy
                        ? "This can take some time. Export will still use the original source file."
                        : "This can take some time. The converted preview is only for browser playback; export will still use the original source file."}
                    </p>
                  </div>
                ) : null}
              </Empty>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
