import { useEffect, useRef } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface VideoPlayerProps {
  src: string
  currentTime: number
  onTimeChange: (value: number) => void
}

export function VideoPlayer({ src, currentTime, onTimeChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current

    if (!video) {
      return
    }

    if (Math.abs(video.currentTime - currentTime) > 0.15) {
      video.currentTime = currentTime
    }
  }, [currentTime])

  return (
    <Card className="border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader>
        <CardTitle>Video preview</CardTitle>
        <CardDescription>
          Use the native playback controls or the timeline below to line up your GIF range.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-black">
          <video
            ref={videoRef}
            className="aspect-video w-full"
            controls
            playsInline
            preload="metadata"
            src={src}
            onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
          />
        </div>
      </CardContent>
    </Card>
  )
}
