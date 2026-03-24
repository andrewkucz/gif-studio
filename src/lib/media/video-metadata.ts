export interface VideoMetadata {
  duration: number
  frameRate: number
  width: number
  height: number
}

type VideoLoadReadiness = "metadata" | "data"

async function detectVideoFrameRate(video: HTMLVideoElement) {
  if (typeof video.requestVideoFrameCallback !== "function") {
    return 24
  }

  return await new Promise<number>((resolve) => {
    let cancelled = false
    let firstFrame:
      | {
          mediaTime: number
          presentedFrames: number
        }
      | null = null
    let lastFrame:
      | {
          mediaTime: number
          presentedFrames: number
        }
      | null = null

    const cleanup = () => {
      cancelled = true
      video.pause()
      video.currentTime = 0
      video.removeEventListener("ended", finish)
      video.removeEventListener("pause", handlePause)
    }

    const estimateFrameRate = () => {
      if (!firstFrame || !lastFrame) {
        return 24
      }

      const mediaDelta = lastFrame.mediaTime - firstFrame.mediaTime
      const frameDelta = lastFrame.presentedFrames - firstFrame.presentedFrames

      if (!Number.isFinite(mediaDelta) || mediaDelta <= 0 || !Number.isFinite(frameDelta) || frameDelta <= 0) {
        return 24
      }

      return frameDelta / mediaDelta
    }

    const finish = () => {
      if (cancelled) {
        return
      }

      cleanup()
      resolve(estimateFrameRate())
    }

    const handlePause = () => {
      if (video.ended) {
        finish()
      }
    }

    const handleFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (cancelled) {
        return
      }

      const snapshot = {
        mediaTime: metadata.mediaTime,
        presentedFrames: metadata.presentedFrames,
      }

      if (!firstFrame) {
        firstFrame = snapshot
      }

      lastFrame = snapshot

      const mediaDelta = lastFrame.mediaTime - firstFrame.mediaTime
      const frameDelta = lastFrame.presentedFrames - firstFrame.presentedFrames
      if (mediaDelta >= 0.4 || frameDelta >= 12 || video.ended) {
        finish()
        return
      }

      video.requestVideoFrameCallback(handleFrame)
    }

    video.addEventListener("ended", finish, { once: true })
    video.addEventListener("pause", handlePause)
    video.currentTime = 0
    const playPromise = video.play()
    video.requestVideoFrameCallback(handleFrame)

    void playPromise.catch(() => {
      finish()
    })
  })
}

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

  const frameRate = readiness === "data" ? await detectVideoFrameRate(video) : 24

  return {
    duration: video.duration,
    frameRate,
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
