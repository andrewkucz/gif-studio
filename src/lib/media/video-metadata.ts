export interface VideoMetadata {
  duration: number
  width: number
  height: number
}

type VideoLoadReadiness = "metadata" | "data"

async function readVideoMetadataFromUrl(
  sourceUrl: string,
  readiness: VideoLoadReadiness
): Promise<VideoMetadata> {
  const video = document.createElement("video")
  video.preload = readiness === "data" ? "auto" : "metadata"
  video.muted = true
  video.playsInline = true
  video.src = sourceUrl

  await new Promise<void>((resolve, reject) => {
    const successEvent = readiness === "data" ? "loadeddata" : "loadedmetadata"

    const handleLoaded = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error("Unable to read metadata from the selected video."))
    }

    const cleanup = () => {
      video.removeEventListener(successEvent, handleLoaded)
      video.removeEventListener("error", handleError)
    }

    video.addEventListener(successEvent, handleLoaded)
    video.addEventListener("error", handleError)
  })

  return {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
  }
}

export async function readVideoMetadata(file: Blob): Promise<VideoMetadata> {
  const objectUrl = URL.createObjectURL(file)

  try {
    return await readVideoMetadataFromUrl(objectUrl, "metadata")
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function probePlayableVideo(file: Blob): Promise<VideoMetadata | null> {
  const objectUrl = URL.createObjectURL(file)

  try {
    return await readVideoMetadataFromUrl(objectUrl, "data")
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
