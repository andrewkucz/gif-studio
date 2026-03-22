import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { TimelineThumbnail } from "@/lib/media/thumbnail-service"

interface FrameStripProps {
  currentTime: number
  duration: number
  isLoading: boolean
  thumbnails: TimelineThumbnail[]
  onSeek: (time: number) => void
}

export function FrameStrip({
  currentTime,
  duration,
  isLoading,
  thumbnails,
  onSeek,
}: FrameStripProps) {
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="relative flex gap-2">
        {isLoading
          ? Array.from({ length: 10 }, (_, index) => (
              <Skeleton key={index} className="aspect-video h-20 flex-1 rounded-lg" />
            ))
          : thumbnails.map((thumbnail) => (
              <button
                key={thumbnail.id}
                className={cn(
                  "group relative flex-1 overflow-hidden rounded-lg border border-transparent bg-background/50 transition",
                  "hover:border-primary/50 focus-visible:border-ring focus-visible:outline-hidden"
                )}
                type="button"
                onClick={() => onSeek(thumbnail.time)}
              >
                <img
                  alt=""
                  className="aspect-video h-20 w-full object-cover transition group-hover:scale-[1.02]"
                  src={thumbnail.url}
                />
              </button>
            ))}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-primary shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
        style={{ left: `calc(${currentPercent}% - 0.5px)` }}
      />
    </div>
  )
}
