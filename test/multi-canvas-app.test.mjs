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

test('App defines selectable chat services for new chat nodes', () => {
  assert.match(appSource, /chatServices\s*=\s*\[/)
  for (const service of ['ChatGPT', 'Claude', 'Gemini', 'DeepSeek', '豆包']) {
    assert.match(appSource, new RegExp(`label: ['"]${service}['"]`))
  }
  for (const url of [
    'https://chatgpt.com',
    'https://claude.ai/new',
    'https://gemini.google.com/app',
    'https://chat.deepseek.com',
    'https://www.doubao.com/chat'
  ]) {
    assert.match(appSource, new RegExp(`url: ['"]${url.replaceAll('.', '\\.')}['"]`))
  }
})

test('App renders a chat service picker before creating a new chat', () => {
  assert.match(appSource, /isChatServicePickerOpen/)
  assert.match(appSource, /chat-service-picker/)
  assert.match(appSource, /createChatForService/)
  assert.match(appSource, /setIsChatServicePickerOpen\(true\)/)
})

test('App persists canvas state with localStorage helpers', () => {
  assert.match(appSource, /loadCanvasState\(window\.localStorage\)/)
  assert.match(appSource, /saveCanvasState\(window\.localStorage,\s*canvasState\)/)
  assert.match(appSource, /activeCanvasId/)
  assert.match(appSource, /setCanvasState/)
})

test('App avoids replacing node state when persisted URL has not changed', () => {
  assert.match(appSource, /node\.data\?\.url === url/)
  assert.match(appSource, /\? node\s*:/)
})

test('App keeps the most recent inactive canvas mounted for faster switching', () => {
  assert.match(appSource, /recentCanvasId/)
  assert.match(appSource, /visibleCanvasIds/)
  assert.match(appSource, /canvas-flow-pane/)
  assert.match(appSource, /display:\s*canvas\.id === canvasState\.activeCanvasId \? 'block' : 'none'/)
})

test('App isolates each mounted canvas with its own React Flow provider', () => {
  assert.match(appSource, /ReactFlowProvider/)
  assert.match(appSource, /<ReactFlowProvider>/)
})

test('App styles the canvas tab bar', () => {
  assert.match(appCss, /\.canvas-tabs\s*\{/)
  assert.match(appCss, /\.canvas-tab\.active\s*\{/)
  assert.match(appCss, /\.canvas-tab-input\s*\{/)
})

test('App styles the chat service picker', () => {
  assert.match(appCss, /\.chat-service-picker\s*\{/)
  assert.match(appCss, /\.chat-service-option\s*\{/)
  assert.match(appCss, /\.chat-service-cancel\s*\{/)
})
