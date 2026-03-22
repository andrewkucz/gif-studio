import { FilmIcon, UploadIcon } from "lucide-react"
import { useDropzone } from "react-dropzone"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface UploadDropzoneProps {
  disabled?: boolean
  onSelect: (file: File) => void
}

export function UploadDropzone({ disabled = false, onSelect }: UploadDropzoneProps) {
  const { getInputProps, getRootProps, isDragActive, open } = useDropzone({
    disabled,
    maxFiles: 1,
    multiple: false,
    noClick: true,
    accept: {
      "video/*": [".mp4", ".mov", ".webm"],
    },
    onDropAccepted: (files) => {
      const file = files[0]
      if (file) {
        onSelect(file)
      }
    },
  })

  return (
    <Card className="border-border/70 bg-card/80 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader>
        <CardTitle>Import a source video</CardTitle>
        <CardDescription>
          Drop a video here or browse from disk. The source is cached locally so timeline
          frames and exports stay on-device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={cn(
            "flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/30 px-6 py-10 text-center transition-colors",
            isDragActive && "border-primary bg-primary/5",
            disabled && "opacity-70"
          )}
        >
          <input {...getInputProps()} />
          <div className="grid size-14 place-content-center rounded-2xl border border-border/70 bg-background/80">
            {isDragActive ? <UploadIcon /> : <FilmIcon />}
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium text-foreground">
              {isDragActive ? "Drop the video to start editing" : "Drag & drop a video"}
            </p>
            <p className="max-w-xl text-sm text-muted-foreground">
              Large local files are supported. Import a video format your browser can play
              directly, such as MP4, MOV, or WebM.
            </p>
          </div>
          <Button onClick={open} disabled={disabled}>
            <UploadIcon data-icon="inline-start" />
            {disabled ? "Importing..." : "Choose video"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
