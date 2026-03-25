const DIRECTORY_NAMES = ["sources", "thumbs", "exports", "previews"] as const

export type StudioDirectory = (typeof DIRECTORY_NAMES)[number]

type StorageManagerWithOpfs = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>
}

function splitPath(path: string) {
  const [directory, ...rest] = path.split("/")
  const fileName = rest.join("/")

  if (!directory || !fileName) {
    throw new Error(`Invalid OPFS path: ${path}`)
  }

  return {
    directory: directory as StudioDirectory,
    fileName,
  }
}

class OpfsRepository {
  private rootPromise: Promise<FileSystemDirectoryHandle> | null = null
  private initPromise: Promise<void> | null = null

  isSupported() {
    if (typeof navigator === "undefined" || typeof navigator.storage === "undefined") {
      return false
    }

    return typeof (navigator.storage as StorageManagerWithOpfs).getDirectory === "function"
  }

  private async getRootDirectory() {
    if (!this.isSupported()) {
      throw new Error("Origin Private File System is not supported in this browser.")
    }

    if (!this.rootPromise) {
      const storageManager = navigator.storage as StorageManagerWithOpfs
      this.rootPromise = storageManager.getDirectory!()
    }

    return this.rootPromise
  }

  async ensureReady() {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const root = await this.getRootDirectory()
        for (const directory of DIRECTORY_NAMES) {
          await root.getDirectoryHandle(directory, { create: true })
        }
      })()
    }

    await this.initPromise
  }

  private async getDirectoryHandle(directory: StudioDirectory) {
    await this.ensureReady()
    const root = await this.getRootDirectory()
    return root.getDirectoryHandle(directory, { create: true })
  }

  async writeFile(directory: StudioDirectory, fileName: string, data: Blob | BufferSource) {
    const targetDirectory = await this.getDirectoryHandle(directory)
    const fileHandle = await targetDirectory.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(data)
    await writable.close()

    return `${directory}/${fileName}`
  }

  async readFile(path: string) {
    const { directory, fileName } = splitPath(path)
    const targetDirectory = await this.getDirectoryHandle(directory)
    const fileHandle = await targetDirectory.getFileHandle(fileName)
    return fileHandle.getFile()
  }

  async hasFile(path: string) {
    try {
      await this.readFile(path)
      return true
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "NotFoundError" || error.name === "TypeMismatchError")
      ) {
        return false
      }

      throw error
    }
  }

  async deleteFile(path: string) {
    const { directory, fileName } = splitPath(path)
    const targetDirectory = await this.getDirectoryHandle(directory)

    try {
      await targetDirectory.removeEntry(fileName)
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "NotFoundError" || error.name === "TypeMismatchError")
      ) {
        return
      }

      throw error
    }
  }

  async getEstimate() {
    return navigator.storage.estimate()
  }
}

export const opfsRepository = new OpfsRepository()
