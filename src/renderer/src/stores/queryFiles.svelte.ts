import type { QueryFile } from '../../../shared/types'

let files = $state<QueryFile[]>([])
let directory = $state('')
let loaded = $state(false)
let unsubscribe: (() => void) | null = null

async function load() {
  const [fileList, dirResult] = await Promise.all([
    window.api.listQueryFiles(),
    window.api.getQueriesDirectory()
  ])
  files = fileList
  directory = dirResult.directory
  loaded = true

  // Listen for external file changes
  if (!unsubscribe) {
    unsubscribe = window.api.onFilesChanged(() => {
      refresh()
    })
  }
}

async function refresh() {
  files = await window.api.listQueryFiles()
}

async function createFile(name?: string): Promise<{ filePath: string; name: string }> {
  const result = await window.api.createQueryFile(name)
  await refresh()
  return result
}

async function deleteFile(filePath: string): Promise<boolean> {
  const result = await window.api.deleteQueryFile(filePath)
  await refresh()
  return result
}

async function renameFile(oldPath: string, newName: string): Promise<{ newPath: string }> {
  const result = await window.api.renameQueryFile(oldPath, newName)
  await refresh()
  return result
}

async function changeDirectory() {
  const result = await window.api.pickQueriesDirectory()
  if (result) {
    await window.api.setQueriesDirectory(result.directory)
    directory = result.directory
    await refresh()
  }
}

function revealInFinder(filePath: string) {
  window.api.revealInFinder(filePath)
}

export const queryFilesStore = {
  get files() { return files },
  get directory() { return directory },
  get loaded() { return loaded },
  load,
  refresh,
  createFile,
  deleteFile,
  renameFile,
  changeDirectory,
  revealInFinder
}
