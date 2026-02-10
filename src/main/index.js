import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

let mainWindow

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

// Intercept ALL new-window requests from webviews.
// This is the core mechanism: when ChatGPT's "Branch in new chat" tries to
// open a new tab, we deny it and instead tell the renderer to create a new
// canvas node with that URL.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('new-branch', {
          url,
          sourceWebContentsId: contents.id
        })
      }
      return { action: 'deny' }
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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
