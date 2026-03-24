import { useEffect, useRef } from "react"
import { MonitorOffIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { formatBytes, formatDuration, formatFrameRate } from "@/lib/studio-utils"
import type { SourceVideo } from "@/state/studio-store"

interface VideoPlayerProps {
  currentTime: number
  source: SourceVideo
  onTimeChange: (value: number) => void
}

export function VideoPlayer({ currentTime, source, onTimeChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { fileTypeLabel, isPreviewSupported, name, src, duration, frameRate, width, height, size } = {
    fileTypeLabel: source.fileTypeLabel,
    isPreviewSupported: source.isPreviewSupported,
    name: source.name,
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
            <p className="mt-1 break-all text-sm font-medium text-foreground">{name}</p>
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
          {isPreviewSupported && src ? (
            <video
              ref={videoRef}
              className="aspect-video w-full"
              controls
              playsInline
              preload="metadata"
              src={src}
              onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
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
                    Live preview is not currently supported for the {fileTypeLabel} file type,
                    but timeline thumbnails and export still work.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
