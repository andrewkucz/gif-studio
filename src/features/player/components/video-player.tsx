import { useEffect, useRef } from "react"
import { MonitorOffIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

interface VideoPlayerProps {
  fileTypeLabel: string
  isPreviewSupported: boolean
  src: string | null
  currentTime: number
  onTimeChange: (value: number) => void
}

export function VideoPlayer({
  fileTypeLabel,
  isPreviewSupported,
  src,
  currentTime,
  onTimeChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

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
        <CardTitle>Video preview</CardTitle>
        <CardDescription>
          {isPreviewSupported
            ? "Use the native playback controls or the timeline below to line up your GIF range."
            : "This source can still be trimmed and exported with FFmpeg, but the browser cannot render a live preview for this format."}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                    Live preview is not currently supported for the {fileTypeLabel} file type.
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
