import { app, BrowserWindow, WebContentsView, ipcMain, shell } from 'electron'
import { appendFileSync } from 'fs'
import { join } from 'path'

let mainWindow
let nativeBranchViewId = 1
const branchViews = new Map()

function branchDebug(event, data = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), event, ...data })
  console.log(`[branch-debug] ${line}`)
  try {
    appendFileSync(join(app.getPath('userData'), 'branch-debug.log'), `${line}\n`)
  } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Chat Nodes Canvas',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load renderer from vite dev server in dev, or from built files in prod
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendBranchToRenderer(url, sourceWebContentsId, reason, nativeViewId = null) {
  branchDebug('send-branch-to-renderer', { url, sourceWebContentsId, reason, nativeViewId })
  if (!mainWindow || mainWindow.isDestroyed()) return

  mainWindow.webContents.send('new-branch', {
    url,
    sourceWebContentsId,
    nativeViewId
  })
}

function isChatGptBranchUrl(url) {
  try {
    const parsed = new URL(url)
    const isChatGpt = parsed.hostname === 'chatgpt.com' || parsed.hostname.endsWith('.chatgpt.com')
    return isChatGpt && parsed.pathname.startsWith('/branch/')
  } catch {
    return false
  }
}

function removeBranchView(nativeViewId) {
  const entry = branchViews.get(nativeViewId)
  if (!entry) return

  branchViews.delete(nativeViewId)
  if (entry.isDebuggerAttached && !entry.view.webContents.isDestroyed()) {
    try {
      entry.view.webContents.debugger.detach()
    } catch {}
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.contentView.removeChildView(entry.view)
  }
  if (!entry.view.webContents.isDestroyed()) {
    entry.view.webContents.close()
  }
}

function isBranchViewVisible(entry) {
  return entry.isInteractive && entry.isInBounds && entry.isScaleReady
}

function reorderBranchViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const entries = [...branchViews.values()].sort((a, b) => a.stackingOrder - b.stackingOrder)
  for (const entry of entries) {
    mainWindow.contentView.removeChildView(entry.view)
    mainWindow.contentView.addChildView(entry.view)
  }
}

async function setNativeBranchViewScale(entry, bounds) {
  if (entry.view.webContents.isDestroyed()) return

  const contentWidth = Math.max(1, Math.round(bounds.contentWidth || bounds.width))
  const contentHeight = Math.max(1, Math.round(bounds.contentHeight || bounds.height))
  const scale = Number.isFinite(bounds.scale) && bounds.scale > 0 ? Math.round(bounds.scale * 1000) / 1000 : 1
  const metricsKey = `${contentWidth}:${contentHeight}:${scale}`
  if (entry.lastMetricsKey === metricsKey) return

  try {
    if (!entry.isDebuggerAttached) {
      entry.view.webContents.debugger.attach('1.3')
      entry.isDebuggerAttached = true
    }
    await entry.view.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: contentWidth,
      height: contentHeight,
      deviceScaleFactor: 1,
      mobile: false,
      scale
    })
    entry.lastMetricsKey = metricsKey
    entry.isScaleReady = true
    entry.view.setVisible(isBranchViewVisible(entry))
  } catch (error) {
    branchDebug('native-branch-view-scale-failed', { error: error.message })
  }
}

// Intercept ALL new-window requests from webviews.
// ChatGPT branch popups need opener context long enough to resolve their final URL.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    branchDebug('webview-created', {
      id: contents.id,
      url: contents.getURL(),
      sessionPath: contents.session.getStoragePath?.()
    })

    contents.on('did-navigate', (_event, url) => {
      branchDebug('webview-did-navigate', { id: contents.id, url })
    })

    contents.on('did-navigate-in-page', (_event, url) => {
      branchDebug('webview-did-navigate-in-page', { id: contents.id, url })
    })

    contents.setWindowOpenHandler((details) => {
      branchDebug('window-open-request', {
        sourceWebContentsId: contents.id,
        url: details.url,
        frameName: details.frameName,
        disposition: details.disposition
      })

      if (!isChatGptBranchUrl(details.url)) {
        return { action: 'deny' }
      }

      return {
        action: 'allow',
        outlivesOpener: true,
        createWindow: (options) => {
          const nativeViewId = `branch-view-${nativeBranchViewId++}`
          const view = new WebContentsView({
            webPreferences: {
              ...options.webPreferences,
              session: contents.session,
              contextIsolation: true,
              nodeIntegration: false
            }
          })
          view.setVisible(false)
          mainWindow.contentView.addChildView(view)
          branchViews.set(nativeViewId, {
            view,
            sourceWebContentsId: contents.id,
            isInBounds: false,
            isInteractive: true,
            isDebuggerAttached: false,
            isScaleReady: false,
            lastMetricsKey: null,
            stackingOrder: 0
          })

          branchDebug('native-branch-view-created', {
            sourceWebContentsId: contents.id,
            nativeViewId,
            childWebContentsId: view.webContents.id,
            sessionPath: view.webContents.session.getStoragePath?.(),
            sameSession: view.webContents.session === contents.session
          })

          sendBranchToRenderer(details.url, contents.id, 'native-branch-view-created', nativeViewId)
          view.webContents.loadURL(details.url)

          view.webContents.on('did-navigate', (_event, url) => {
            branchDebug('native-branch-view-did-navigate', {
              sourceWebContentsId: contents.id,
              nativeViewId,
              url
            })
            const entry = branchViews.get(nativeViewId)
            if (entry) {
              entry.lastMetricsKey = null
              entry.isScaleReady = false
            }
          })

          view.webContents.on('did-navigate-in-page', (_event, url) => {
            branchDebug('native-branch-view-did-navigate-in-page', {
              sourceWebContentsId: contents.id,
              nativeViewId,
              url
            })
            const entry = branchViews.get(nativeViewId)
            if (entry) {
              entry.lastMetricsKey = null
              entry.isScaleReady = false
            }
          })

          view.webContents.once('destroyed', () => {
            branchViews.delete(nativeViewId)
          })

          return view.webContents
        }
      }
    })

    // Intercept external link navigation (non-chatgpt links) -> open in system browser
    contents.on('will-navigate', (event, url) => {
      const parsed = new URL(url)
      const allowedHosts = ['chatgpt.com', 'auth0.openai.com', 'auth.openai.com', 'accounts.google.com', 'login.microsoftonline.com', 'appleid.apple.com']
      const isAllowed = allowedHosts.some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h)
      )
      if (!isAllowed) {
        event.preventDefault()
        shell.openExternal(url)
      }
    })
  }
})

ipcMain.handle('set-branch-view-bounds', (_event, nativeViewId, bounds) => {
  const entry = branchViews.get(nativeViewId)
  if (!entry) return

  entry.isInBounds = bounds.width > 0 && bounds.height > 0
  entry.stackingOrder = Number.isFinite(bounds.stackingOrder) ? bounds.stackingOrder : 0
  entry.view.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  })
  if (entry.isInBounds) {
    setNativeBranchViewScale(entry, bounds)
  }
  entry.view.setVisible(isBranchViewVisible(entry))
  reorderBranchViews()
})

ipcMain.handle('set-branch-views-interactive', (_event, isInteractive) => {
  for (const entry of branchViews.values()) {
    entry.isInteractive = isInteractive
    entry.view.setVisible(isBranchViewVisible(entry))
  }
})

ipcMain.handle('close-branch-view', (_event, nativeViewId) => {
  removeBranchView(nativeViewId)
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
