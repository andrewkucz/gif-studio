import { opfsRepository } from "@/lib/opfs/opfs-repository"
import { clampNumber, formatDuration } from "@/lib/studio-utils"

export interface TimelineThumbnail {
  id: string
  path: string
  time: number
  url: string
}

interface CreateTimelineThumbnailsOptions {
  assetId: string
  sourceFile: File
  sourceUrl: string
  duration: number
  count?: number
}

async function waitForVideoToLoad(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const handleLoadedData = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error("Unable to prepare the video for thumbnail extraction."))
    }

    const cleanup = () => {
      video.removeEventListener("loadeddata", handleLoadedData)
      video.removeEventListener("error", handleError)
    }

    video.addEventListener("loadeddata", handleLoadedData)
    video.addEventListener("error", handleError)
  })
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  const targetTime = clampNumber(
    time,
    0,
    Number.isFinite(video.duration) && video.duration > 0 ? Math.max(video.duration - 0.05, 0) : 0
  )

  if (Math.abs(video.currentTime - targetTime) < 0.01) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const handleSeeked = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error("Unable to seek the video while generating thumbnails."))
    }

    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked)
      video.removeEventListener("error", handleError)
    }

    video.addEventListener("seeked", handleSeeked)
    video.addEventListener("error", handleError)
    video.currentTime = targetTime
  })
}

async function createThumbnailBlob(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  width: number,
  height: number
) {
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Canvas 2D context is unavailable for timeline thumbnails.")
  }

  canvas.width = width
  canvas.height = height
  context.drawImage(video, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (!value) {
          reject(new Error("Unable to encode a timeline thumbnail."))
          return
        }

        resolve(value)
      },
      "image/jpeg",
      0.85
    )
  })

  return blob
}

export async function createTimelineThumbnails({
  assetId,
  sourceFile,
  sourceUrl,
  duration,
  count = 10,
}: CreateTimelineThumbnailsOptions) {
  await opfsRepository.ensureReady()

  const positions = Array.from({ length: Math.max(count, 2) }, (_, index) =>
    count === 1 ? 0 : (duration * index) / (count - 1)
  )

  const video = document.createElement("video")
  video.preload = "auto"
  video.muted = true
  video.playsInline = true
  video.src = sourceUrl

  await waitForVideoToLoad(video)

  const canvas = document.createElement("canvas")
  const thumbnailWidth = 192
  const thumbnailHeight = Math.max(
    108,
    Math.round((thumbnailWidth * Math.max(video.videoHeight, 1)) / Math.max(video.videoWidth, 1))
  )

  const thumbnails: TimelineThumbnail[] = []

  for (const [index, time] of positions.entries()) {
    const fileName = `${assetId}-${index}.jpg`
    const path = `thumbs/${fileName}`

    if (await opfsRepository.hasFile(path)) {
      const cachedFile = await opfsRepository.readFile(path)
      thumbnails.push({
        id: `${assetId}-${index}`,
        path,
        time,
        url: URL.createObjectURL(cachedFile),
      })
      continue
    }

    await seekVideo(video, time)
    const blob = await createThumbnailBlob(video, canvas, thumbnailWidth, thumbnailHeight)
    const savedPath = await opfsRepository.writeFile("thumbs", fileName, blob)
    const storedFile = await opfsRepository.readFile(savedPath)

    thumbnails.push({
      id: `${assetId}-${index}`,
      path: savedPath,
      time,
      url: URL.createObjectURL(storedFile),
    })
  }

  if (sourceFile.size === 0) {
    throw new Error(`Unable to process ${formatDuration(duration)} of thumbnail data.`)
  }

  return thumbnails
}
