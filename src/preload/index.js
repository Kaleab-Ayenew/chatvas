import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onNewBranch: (callback) => {
    ipcRenderer.on('new-branch', (_event, data) => callback(data))
  },
  removeNewBranchListener: () => {
    ipcRenderer.removeAllListeners('new-branch')
  },
  setBranchViewBounds: (nativeViewId, bounds) => ipcRenderer.invoke('set-branch-view-bounds', nativeViewId, bounds),
  setBranchViewsInteractive: (isInteractive) => ipcRenderer.invoke('set-branch-views-interactive', isInteractive),
  closeBranchView: (nativeViewId) => ipcRenderer.invoke('close-branch-view', nativeViewId)
})
