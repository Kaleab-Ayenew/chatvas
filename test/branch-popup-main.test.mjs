import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const mainSource = await readFile(new URL('../src/main/index.js', import.meta.url), 'utf8')

test('main process preserves ChatGPT branch popup webContents in a native view', () => {
  assert.match(mainSource, /import \{ app, BrowserWindow, WebContentsView, ipcMain, shell \} from 'electron'/)
  assert.match(mainSource, /function isChatGptBranchUrl\(url\)/)
  assert.match(mainSource, /parsed\.pathname\.startsWith\('\/branch\/'\)/)
  assert.match(mainSource, /const branchViews = new Map\(\)/)
  assert.match(mainSource, /createWindow:\s*\(options\) => \{/)
  assert.match(mainSource, /new WebContentsView\(\{\s*webPreferences: \{[\s\S]*\.\.\.options\.webPreferences/)
  assert.match(mainSource, /mainWindow\.contentView\.addChildView\(view\)/)
  assert.match(mainSource, /return view\.webContents/)
  assert.match(mainSource, /view\.webContents\.loadURL\(details\.url\)/)
  assert.match(mainSource, /mainWindow\.webContents\.send\('new-branch',[\s\S]*nativeViewId/)
  assert.match(mainSource, /ipcMain\.handle\('set-branch-view-bounds'/)
  assert.match(mainSource, /view\.setBounds\(\{[\s\S]*width: bounds\.width[\s\S]*height: bounds\.height[\s\S]*\}\)/)
  assert.match(mainSource, /setNativeBranchViewScale\(entry, bounds\)/)
  assert.match(mainSource, /Emulation\.setDeviceMetricsOverride/)
  assert.match(mainSource, /entry\.lastMetricsKey === metricsKey/)
  assert.match(mainSource, /entry\.isScaleReady = true/)
  assert.match(mainSource, /entry\.view\.setVisible\(isBranchViewVisible\(entry\)\)/)
  assert.match(mainSource, /function reorderBranchViews\(\)/)
  assert.match(mainSource, /\.sort\(\(a, b\) => a\.stackingOrder - b\.stackingOrder\)/)
  assert.match(mainSource, /mainWindow\.contentView\.removeChildView\(entry\.view\)/)
  assert.match(mainSource, /mainWindow\.contentView\.addChildView\(entry\.view\)/)
  assert.doesNotMatch(mainSource, /setZoomFactor/)
  assert.match(mainSource, /ipcMain\.handle\('set-branch-views-interactive'/)
  assert.match(mainSource, /ipcMain\.handle\('close-branch-view'/)
  assert.match(mainSource, /mainWindow\.contentView\.removeChildView\(entry\.view\)/)
  assert.doesNotMatch(mainSource, /sendBranchToRenderer\(child\.getURL\(\), contents\.id, 'child-did-finish-load'\)/)
})
