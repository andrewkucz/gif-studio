import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { clampNumber, createOutputFileName, formatDuration } from "@/lib/studio-utils"
import type { GifSettings, SourceVideo } from "@/state/studio-store"

interface GifSettingsFormProps {
  duration: number
  settings: GifSettings
  source: SourceVideo | null
  trimWindow: [number, number]
  onChange: (settings: Partial<GifSettings>) => void
}

export function GifSettingsForm({
  duration,
  settings,
  source,
  trimWindow,
  onChange,
}: GifSettingsFormProps) {
  const maxWidth = source?.width ?? 960

  return (
    <Card className="border-border/70 bg-card/85 shadow-2xl shadow-black/10 backdrop-blur">
      <CardHeader>
        <CardTitle>GIF settings</CardTitle>
        <CardDescription>
          Start with sensible defaults, then tune output size and palette depth before
          exporting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend>Output options</FieldLegend>
          <FieldDescription>
            {source
              ? `Trimmed clip duration: ${formatDuration(duration)} from ${formatDuration(
                  trimWindow[0]
                )} to ${formatDuration(trimWindow[1])}.`
              : "Import a source video to unlock output controls."}
          </FieldDescription>

          {source ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{source.width}×{source.height} source</Badge>
              <Badge variant="outline">{formatDuration(source.duration)} source length</Badge>
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
                  type="number"
                  value={settings.fps}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (!Number.isFinite(value)) {
                      return
                    }

                    onChange({
                      fps: clampNumber(Math.round(value), 5, 24),
                    })
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>fps</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="gif-colors">Palette colors</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="gif-colors"
                  disabled={!source}
                  inputMode="numeric"
                  type="number"
                  value={settings.colors}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (!Number.isFinite(value)) {
                      return
                    }

                    onChange({
                      colors: clampNumber(Math.round(value), 16, 256),
                    })
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>colors</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>Higher values preserve gradients but create larger GIFs.</FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                checked={settings.loop}
                disabled={!source}
                id="gif-loop"
                onCheckedChange={(checked) => onChange({ loop: checked === true })}
              />
              <FieldLabel htmlFor="gif-loop">Loop forever</FieldLabel>
            </Field>
          </FieldGroup>
        </FieldSet>
      </CardContent>
    </Card>
  )
}
