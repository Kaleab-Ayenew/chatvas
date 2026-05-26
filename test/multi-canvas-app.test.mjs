import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const appSource = await readFile(new URL('../src/renderer/src/App.jsx', import.meta.url), 'utf8')
const appCss = await readFile(new URL('../src/renderer/src/App.css', import.meta.url), 'utf8')

test('App renders a canvas tab bar with create and rename controls', () => {
  assert.match(appSource, /className="canvas-tabs"/)
  assert.match(appSource, /canvas-tab/)
  assert.match(appSource, /className="add-canvas-btn"/)
  assert.match(appSource, /onDoubleClick=\{[^}]*startRenamingCanvas/)
  assert.match(appSource, /onFocus=\{[^}]*\.select\(\)/)
  assert.match(appSource, /renameCanvas/)
})

test('App persists canvas state with localStorage helpers', () => {
  assert.match(appSource, /loadCanvasState\(window\.localStorage\)/)
  assert.match(appSource, /saveCanvasState\(window\.localStorage,\s*canvasState\)/)
  assert.match(appSource, /activeCanvasId/)
  assert.match(appSource, /setCanvasState/)
})

test('App styles the canvas tab bar', () => {
  assert.match(appCss, /\.canvas-tabs\s*\{/)
  assert.match(appCss, /\.canvas-tab\.active\s*\{/)
  assert.match(appCss, /\.canvas-tab-input\s*\{/)
})
