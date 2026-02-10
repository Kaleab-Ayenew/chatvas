import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onNewBranch: (callback) => {
    ipcRenderer.on('new-branch', (_event, data) => callback(data))
  },
  removeNewBranchListener: () => {
    ipcRenderer.removeAllListeners('new-branch')
  }
})
