import { useState } from "react"
import { CheckIcon, ChevronDownIcon, ClipboardIcon, DownloadIcon, LoaderCircleIcon, TerminalIcon, WandSparklesIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  GIF_CUSTOM_COLOR_MAX,
  GIF_CUSTOM_COLOR_MIN,
  buildFfmpegCommand,
  clampNumber,
  convertGifCustomSizeValue,
  estimateGifSizeBytes,
  formatBytes,
  formatDuration,
  gifColorPresetOptions,
  getGifColorPresetConfig,
  getMaxGifFrameRate,
  getGifOutputWidth,
  getScaledHeight,
} from "@/lib/studio-utils"
import type { GeneratedGif, GifSettings, SourceVideo } from "@/state/studio-store"

interface ExportPanelProps {
  canGenerate: boolean
  errorMessage: string | null
  output: GeneratedGif | null
  phase: "idle" | "loading" | "saving" | "done" | "error"
  progress: number
  settings: GifSettings
  selectionDuration: number
  selectionStart: number
  selectionEnd: number
  source: SourceVideo | null
  onSettingsChange: (settings: Partial<GifSettings>) => void
  onGenerate: () => void
}

export function ExportPanel({
  canGenerate,
  errorMessage,
  output,
  phase,
  progress,
  settings,
  selectionDuration,
  selectionStart,
  selectionEnd,
  source,
  onSettingsChange,
  onGenerate,
}: ExportPanelProps) {
  const isBusy = phase === "loading" || phase === "saving"
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isFfmpegDialogOpen, setIsFfmpegDialogOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const maxGifFps = source ? getMaxGifFrameRate(source.frameRate) : 24
  const activeColorPreset = gifColorPresetOptions.find((option) => option.value === settings.colorPreset)
  const activeColorConfig = getGifColorPresetConfig(settings.colorPreset, settings.customColorCount)
  const outputWidth = source
    ? getGifOutputWidth(source.width, settings.sizeMode, settings.sizeUnit, settings.width)
    : 0
  const outputHeight = source ? getScaledHeight(source.width, source.height, outputWidth) : 0
  const estimatedSizeBytes =
    source && outputWidth > 0 && outputHeight > 0
      ? estimateGifSizeBytes({
          width: outputWidth,
          height: outputHeight,
          duration: selectionDuration,
          fps: settings.fps,
          sourceFrameRate: source.frameRate,
          colorPreset: settings.colorPreset,
          customColorCount: settings.customColorCount,
          loopMode: settings.loopMode,
          loopCount: settings.loopCount,
          sizeMode: settings.sizeMode,
          sizeUnit: settings.sizeUnit,
        })
      : 0

  const ffmpegCommand = source
    ? buildFfmpegCommand({
        startTime: selectionStart,
        endTime: selectionEnd,
        width: outputWidth,
        fps: settings.fps,
        paletteDither: activeColorConfig.paletteDither,
        paletteMaxColors: activeColorConfig.maxColors,
        paletteStatsMode: activeColorConfig.paletteStatsMode,
        loopMode: settings.loopMode,
        loopCount: settings.loopCount,
        inputFileName: source.name,
        outputFileName: settings.fileName,
      })
    : null

  function handleCopyCommand() {
    if (!ffmpegCommand) return
    void navigator.clipboard.writeText(ffmpegCommand).then(() => {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    })
  }

  return (
    <Card className="border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader>
        <CardTitle>Generate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <FieldGroup>
          <Field>
            <FieldLabel>Size</FieldLabel>
            <div className="space-y-3">
              <div className="inline-flex w-fit rounded-lg border border-border/70 bg-background/60 p-1">
                <Button
                  size="sm"
                  type="button"
                  variant={settings.sizeMode === "original" ? "secondary" : "ghost"}
                  disabled={!source}
                  onClick={() => onSettingsChange({ sizeMode: "original" })}
                >
                  Original
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant={settings.sizeMode === "custom" ? "secondary" : "ghost"}
                  disabled={!source}
                  onClick={() => onSettingsChange({ sizeMode: "custom" })}
                >
                  Custom
                </Button>
              </div>

              {settings.sizeMode === "custom" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <InputGroup className="min-w-0 flex-1">
                      <InputGroupInput
                        id="gif-width"
                        disabled={!source}
                        inputMode="numeric"
                        min={1}
                        step={1}
                        type="number"
                        value={settings.width}
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (!Number.isFinite(value)) {
                            return
                          }

                          onSettingsChange({
                            width: Math.max(1, Math.round(value)),
                          })
                        }}
                      />
                    </InputGroup>

                    <div className="inline-flex h-9 w-fit items-center rounded-lg border border-border/70 bg-background/60 p-1">
                      <Button
                        size="sm"
                        type="button"
                        variant={settings.sizeUnit === "pixels" ? "secondary" : "ghost"}
                        disabled={!source}
                        onClick={() =>
                          onSettingsChange({
                            sizeUnit: "pixels",
                            width: source
                              ? convertGifCustomSizeValue(
                                  source.width,
                                  settings.width,
                                  settings.sizeUnit,
                                  "pixels"
                                )
                              : settings.width,
                          })
                        }
                      >
                        px
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant={settings.sizeUnit === "percent" ? "secondary" : "ghost"}
                        disabled={!source}
                        onClick={() =>
                          onSettingsChange({
                            sizeUnit: "percent",
                            width: source
                              ? convertGifCustomSizeValue(
                                  source.width,
                                  settings.width,
                                  settings.sizeUnit,
                                  "percent"
                                )
                              : settings.width,
                          })
                        }
                      >
                        %
                      </Button>
                    </div>
                  </div>

                  <FieldDescription>
                    Output width for the generated GIF
                  </FieldDescription>
                </div>
              ) : null}
            </div>
          </Field>
        </FieldGroup>

        <div className="rounded-xl border border-border/60 bg-muted/15">
          <button
            aria-expanded={isAdvancedOpen}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
            type="button"
            onClick={() => setIsAdvancedOpen((value) => !value)}
          >
            <span>Advanced options</span>
            <ChevronDownIcon
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                isAdvancedOpen ? "rotate-0" : "-rotate-90"
              )}
            />
          </button>

          {isAdvancedOpen ? (
            <div className="border-t border-border/60 px-3 py-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="gif-fps">Frame rate</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="gif-fps"
                      disabled={!source}
                      inputMode="numeric"
                      max={maxGifFps}
                      min={1}
                      type="number"
                      value={settings.fps}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        if (!Number.isFinite(value)) {
                          return
                        }

                        onSettingsChange({
                          fps: clampNumber(Math.round(value), 1, maxGifFps),
                        })
                      }}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>fps</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>Max {maxGifFps} fps from source</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Color profile</FieldLabel>
                  <div className="space-y-3">
                    <div className="inline-flex w-fit flex-wrap rounded-lg border border-border/70 bg-background/60 p-1">
                      {gifColorPresetOptions.map((option) => (
                        <Button
                          key={option.value}
                          size="sm"
                          type="button"
                          variant={settings.colorPreset === option.value ? "secondary" : "ghost"}
                          disabled={!source}
                          onClick={() => onSettingsChange({ colorPreset: option.value })}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    {settings.colorPreset === "custom" ? (
                      <InputGroup>
                        <InputGroupInput
                          disabled={!source}
                          id="gif-custom-colors"
                          inputMode="numeric"
                          max={GIF_CUSTOM_COLOR_MAX}
                          min={GIF_CUSTOM_COLOR_MIN}
                          step={1}
                          type="number"
                          value={settings.customColorCount}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            if (!Number.isFinite(value)) {
                              return
                            }

                            onSettingsChange({
                              customColorCount: clampNumber(
                                Math.round(value),
                                GIF_CUSTOM_COLOR_MIN,
                                GIF_CUSTOM_COLOR_MAX
                              ),
                            })
                          }}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>colors</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                    ) : null}
                    {activeColorPreset?.description ? <FieldDescription>
                      {activeColorPreset?.description} ({activeColorConfig.maxColors} colors)
                    </FieldDescription> : null}
                  </div>
                </Field>

                <Field>
                  <FieldLabel>Looping</FieldLabel>
                  <div className="space-y-3">
                    <div className="inline-flex w-fit rounded-lg border border-border/70 bg-background/60 p-1">
                      <Button
                        size="sm"
                        type="button"
                        variant={settings.loopMode === "infinite" ? "secondary" : "ghost"}
                        disabled={!source}
                        onClick={() => onSettingsChange({ loopMode: "infinite" })}
                      >
                        Infinite
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant={settings.loopMode === "count" ? "secondary" : "ghost"}
                        disabled={!source}
                        onClick={() => onSettingsChange({ loopMode: "count" })}
                      >
                        Specific count
                      </Button>
                    </div>

                    {settings.loopMode === "count" ? (
                      <InputGroup>
                        <InputGroupInput
                          disabled={!source}
                          id="gif-loop-count"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          type="number"
                          value={settings.loopCount}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            if (!Number.isFinite(value)) {
                              return
                            }

                            onSettingsChange({
                              loopCount: Math.max(1, Math.round(value)),
                            })
                          }}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>loops</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                    ) : null}
                  </div>
                </Field>
              </FieldGroup>
            </div>
          ) : null}
        </div>

        {source ? (
          <p className="text-xs text-muted-foreground">
            Output: {outputWidth}×{outputHeight} • {formatDuration(selectionDuration)} • Est.{" "}
            {formatBytes(estimatedSizeBytes)}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button className="min-w-0 flex-1" disabled={!canGenerate || isBusy} onClick={onGenerate}>
            {isBusy ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <WandSparklesIcon data-icon="inline-start" />
            )}
            {isBusy ? "Generating..." : "Generate GIF"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More options"
                disabled={!source}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!ffmpegCommand}
                onSelect={() => setIsFfmpegDialogOpen(true)}
              >
                <TerminalIcon className="text-muted-foreground" />
                View FFmpeg command
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Dialog open={isFfmpegDialogOpen} onOpenChange={setIsFfmpegDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>FFmpeg command</DialogTitle>
              <DialogDescription>
                The exact command that will be used to generate the GIF with the current settings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <textarea
                aria-label="FFmpeg command"
                className="h-32 w-full resize-none rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                readOnly
                value={ffmpegCommand ?? ""}
              />
              <Button
                size="sm"
                type="button"
                variant="outline"
                className="ml-auto w-fit"
                onClick={handleCopyCommand}
              >
                {isCopied ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <ClipboardIcon data-icon="inline-start" />
                )}
                {isCopied ? "Copied!" : "Copy to clipboard"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
            <div className="flex items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground" title={output.fileName}>
                  {output.fileName}
                </p>
                <p className="text-xs text-muted-foreground">{formatBytes(output.size)}</p>
              </div>
              <Button asChild className="shrink-0">
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
