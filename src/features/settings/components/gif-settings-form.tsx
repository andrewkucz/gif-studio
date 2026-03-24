import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  clampNumber,
  createOutputFileName,
  formatDuration,
  formatFrameRate,
  gifColorPresetOptions,
  getGifColorPresetConfig,
  getMaxGifFrameRate,
} from "@/lib/studio-utils"
import type { GifSettings, SourceVideo } from "@/state/studio-store"

interface GifSettingsFormProps {
  duration: number
  isTrimEnabled: boolean
  settings: GifSettings
  source: SourceVideo | null
  trimWindow: [number, number]
  onChange: (settings: Partial<GifSettings>) => void
}

export function GifSettingsForm({
  duration,
  isTrimEnabled,
  settings,
  source,
  trimWindow,
  onChange,
}: GifSettingsFormProps) {
  const maxWidth = source?.width ?? 960
  const maxGifFps = source ? getMaxGifFrameRate(source.frameRate) : 24

  return (
    <Card className="border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader>
        <CardTitle>GIF settings</CardTitle>
        <CardDescription>
          Start with sensible defaults, then tune output size, frame rate, and color profile before
          exporting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend>Output options</FieldLegend>
          <FieldDescription>
            {source
              ? isTrimEnabled
                ? `Trimmed clip duration: ${formatDuration(duration)} from ${formatDuration(
                    trimWindow[0]
                  )} to ${formatDuration(trimWindow[1])}.`
                : `Using the full source video for export: ${formatDuration(duration)}.`
              : "Import a source video to unlock output controls."}
          </FieldDescription>

          {source ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{source.width}×{source.height} source</Badge>
              <Badge variant="outline">{formatDuration(source.duration)} source length</Badge>
              <Badge variant="outline">{formatFrameRate(source.frameRate)} source fps</Badge>
              <Badge variant={isTrimEnabled ? "secondary" : "outline"}>
                {formatDuration(duration)} export length
              </Badge>
            </div>
          ) : null}

          <FieldGroup className="mt-4">
            <Field>
              <FieldLabel htmlFor="file-name">File name</FieldLabel>
              <Input
                id="file-name"
                disabled={!source}
                value={settings.fileName}
                onChange={(event) => onChange({ fileName: createOutputFileName(event.target.value) })}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="gif-width">Width</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="gif-width"
                  disabled={!source}
                  inputMode="numeric"
                  type="number"
                  value={settings.width}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (!Number.isFinite(value)) {
                      return
                    }

                    onChange({
                      width: clampNumber(Math.round(value), 160, Math.max(maxWidth, 160)),
                    })
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>px</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>Keep it close to the source width for sharper motion.</FieldDescription>
            </Field>

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

                    onChange({
                      fps: clampNumber(Math.round(value), 1, maxGifFps),
                    })
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>fps</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                GIF output is capped at {maxGifFps} fps to match the detected source rate of{" "}
                {source ? formatFrameRate(source.frameRate) : "Unknown"}.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Color profile</FieldLabel>
              <div className="space-y-3">
                <div className="inline-flex w-fit rounded-lg border border-border/70 bg-background/60 p-1">
                  {gifColorPresetOptions.map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      type="button"
                      variant={settings.colorPreset === option.value ? "secondary" : "ghost"}
                      disabled={!source}
                      onClick={() => onChange({ colorPreset: option.value })}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <FieldDescription>
                  {
                    gifColorPresetOptions.find((option) => option.value === settings.colorPreset)
                      ?.description
                  }{" "}
                  {settings.colorPreset === "original"
                    ? `Uses up to ${getGifColorPresetConfig(settings.colorPreset).maxColors} colors to stay as close to the source video as possible.`
                    : null}
                </FieldDescription>
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
                    onClick={() => onChange({ loopMode: "infinite" })}
                  >
                    Infinite
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant={settings.loopMode === "count" ? "secondary" : "ghost"}
                    disabled={!source}
                    onClick={() => onChange({ loopMode: "count" })}
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

                        onChange({
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
              <FieldDescription>
                {settings.loopMode === "infinite"
                  ? "The GIF will keep repeating until the viewer is closed."
                  : "Set how many total times the GIF should play."}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  )
}
