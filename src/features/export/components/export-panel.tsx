import { DownloadIcon, LoaderCircleIcon, WandSparklesIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatBytes, formatDuration } from "@/lib/studio-utils"
import type { GeneratedGif } from "@/state/studio-store"

interface ExportPanelProps {
  canGenerate: boolean
  errorMessage: string | null
  output: GeneratedGif | null
  phase: "idle" | "loading" | "saving" | "done" | "error"
  progress: number
  selectionDuration: number
  onGenerate: () => void
}

const phaseLabels: Record<ExportPanelProps["phase"], string> = {
  idle: "Ready",
  loading: "Generating",
  saving: "Saving",
  done: "Done",
  error: "Needs attention",
}

export function ExportPanel({
  canGenerate,
  errorMessage,
  output,
  phase,
  progress,
  selectionDuration,
  onGenerate,
}: ExportPanelProps) {
  const isBusy = phase === "loading" || phase === "saving"

  return (
    <Card className="border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader>
        <CardTitle>Generate GIF</CardTitle>
        <CardDescription>
          Export the selected range to a locally generated GIF and keep the result in OPFS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={phase === "done" ? "secondary" : "outline"}>{phaseLabels[phase]}</Badge>
          <Badge variant="outline">{formatDuration(selectionDuration)} clip</Badge>
        </div>

        <Button className="w-full" disabled={!canGenerate || isBusy} onClick={onGenerate}>
          {isBusy ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <WandSparklesIcon data-icon="inline-start" />}
          {isBusy ? "Generating..." : "Generate GIF"}
        </Button>

        {isBusy ? (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              {phase === "saving" ? "Writing the finished GIF to OPFS…" : "Processing frames in FFmpeg…"}
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Export issue</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {output ? (
          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/25 p-3">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60">
              <img alt="Generated GIF preview" className="w-full object-contain" src={output.url} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-foreground">{output.fileName}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(output.size)}</p>
              </div>
              <Button asChild>
                <a download={output.fileName} href={output.url}>
                  <DownloadIcon data-icon="inline-start" />
                  Download
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
            Your generated GIF preview and download link will appear here.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
