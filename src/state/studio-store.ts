import { create } from "zustand"

import type { TimelineThumbnail } from "@/lib/media/thumbnail-service"

export type RangeInputMode = "start-length" | "start-end"
export type GifLoopMode = "infinite" | "count"
export type GifColorPreset = "original" | "balanced" | "compact"

export interface SourceVideo {
  id: string
  name: string
  opfsPath: string
  previewUrl: string
  duration: number
  frameRate: number
  width: number
  height: number
  size: number
}

export interface GifSettings {
  fileName: string
  width: number
  fps: number
  colorPreset: GifColorPreset
  loopMode: GifLoopMode
  loopCount: number
}

export interface GeneratedGif {
  fileName: string
  opfsPath: string
  size: number
  url: string
}

type ExportPhase = "idle" | "loading" | "saving" | "done" | "error"

interface StorageEstimateState {
  usage: number
  quota: number
}

interface StudioState {
  source: SourceVideo | null
  thumbnails: TimelineThumbnail[]
  trimWindow: [number, number]
  isTrimEnabled: boolean
  rangeInputMode: RangeInputMode
  isDurationLocked: boolean
  currentTime: number
  settings: GifSettings
  output: GeneratedGif | null
  exportPhase: ExportPhase
  exportProgress: number
  errorMessage: string | null
  isImporting: boolean
  importStatusMessage: string | null
  isGeneratingThumbnails: boolean
  storageEstimate: StorageEstimateState | null
  setSource: (source: SourceVideo | null) => void
  setThumbnails: (thumbnails: TimelineThumbnail[]) => void
  setTrimWindow: (trimWindow: [number, number]) => void
  setTrimEnabled: (value: boolean) => void
  setRangeInputMode: (mode: RangeInputMode) => void
  setDurationLocked: (value: boolean) => void
  setCurrentTime: (currentTime: number) => void
  setSettings: (settings: Partial<GifSettings>) => void
  setOutput: (output: GeneratedGif | null) => void
  setExportState: (state: { phase: ExportPhase; progress: number }) => void
  setError: (message: string | null) => void
  clearError: () => void
  setImporting: (value: boolean) => void
  setImportStatusMessage: (message: string | null) => void
  setThumbnailState: (value: boolean) => void
  setStorageEstimate: (estimate: StorageEstimateState | null) => void
}

const defaultSettings: GifSettings = {
  fileName: "untitled.gif",
  width: 480,
  fps: 12,
  colorPreset: "original",
  loopMode: "infinite",
  loopCount: 1,
}

export const useStudioStore = create<StudioState>((set) => ({
  source: null,
  thumbnails: [],
  trimWindow: [0, 3],
  isTrimEnabled: false,
  rangeInputMode: "start-length",
  isDurationLocked: false,
  currentTime: 0,
  settings: defaultSettings,
  output: null,
  exportPhase: "idle",
  exportProgress: 0,
  errorMessage: null,
  isImporting: false,
  importStatusMessage: null,
  isGeneratingThumbnails: false,
  storageEstimate: null,
  setSource: (source) => set({ source }),
  setThumbnails: (thumbnails) => set({ thumbnails }),
  setTrimWindow: (trimWindow) => set({ trimWindow }),
  setTrimEnabled: (isTrimEnabled) => set({ isTrimEnabled }),
  setRangeInputMode: (rangeInputMode) => set({ rangeInputMode }),
  setDurationLocked: (isDurationLocked) => set({ isDurationLocked }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setSettings: (settings) =>
    set((state) => ({
      settings: {
        ...state.settings,
        ...settings,
      },
    })),
  setOutput: (output) => set({ output }),
  setExportState: ({ phase, progress }) => set({ exportPhase: phase, exportProgress: progress }),
  setError: (message) => set({ errorMessage: message }),
  clearError: () => set({ errorMessage: null }),
  setImporting: (value) => set({ isImporting: value }),
  setImportStatusMessage: (message) => set({ importStatusMessage: message }),
  setThumbnailState: (value) => set({ isGeneratingThumbnails: value }),
  setStorageEstimate: (estimate) => set({ storageEstimate: estimate }),
}))
