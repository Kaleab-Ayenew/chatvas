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

test('App lets users manually connect chat nodes with persisted branch-style edges', () => {
  assert.match(
    appSource,
    /import\s*\{[^}]*addEdge[^}]*\}\s*from\s*['"]@xyflow\/react['"]/,
    'React Flow addEdge should be imported'
  )
  assert.match(appSource, /const handleConnect = useCallback/, 'CanvasFlow should define a manual connect handler')
  assert.match(appSource, /onConnect=\{handleConnect\}/, 'ReactFlow should receive the manual connect handler')
  assert.match(
    appSource,
    /const handleConnect = useCallback\([\s\S]*addEdge\([\s\S]*animated:\s*true[\s\S]*style:\s*\{ stroke:\s*['"]var\(--accent\)['"], strokeWidth:\s*2 \}/,
    'Manual edges should be styled like branch edges inside handleConnect'
  )
})

test('App disables webview pointer events while drawing a manual connection', () => {
  assert.match(appSource, /const \[isCanvasGestureActive, setIsCanvasGestureActive\] = useState\(false\)/)
  assert.match(appSource, /const onCanvasGestureStart = useCallback\(\(\) => \{\s*setIsCanvasGestureActive\(true\)\s*\}, \[\]\)/)
  assert.match(appSource, /const onCanvasGestureEnd = useCallback\(\(\) => \{\s*setIsCanvasGestureActive\(false\)\s*\}, \[\]\)/)
  assert.match(appSource, /onConnectStart=\{onCanvasGestureStart\}/)
  assert.match(appSource, /onConnectEnd=\{onCanvasGestureEnd\}/)
  assert.match(appSource, /connectOnClick=\{false\}/)
  assert.match(appSource, /window\.addEventListener\('mouseup', handleWindowMouseUp, true\)/)
  assert.match(appSource, /window\.addEventListener\('blur', handleWindowBlur\)/)
  assert.match(appSource, /canvas-flow-gesture-active/)
  assert.match(appCss, /\.canvas-flow-gesture-active \.chat-webview\s*\{[^}]*pointer-events:\s*none/s)
})

test('App can detect which canvas tab is under a dragged node pointer', () => {
  assert.match(appSource, /const canvasTabRefs = useRef\(new Map\(\)\)/)
  assert.match(appSource, /const setCanvasTabRef = useCallback/)
  assert.match(appSource, /const getCanvasIdAtPoint = useCallback/)
  assert.match(appSource, /getBoundingClientRect\(\)/)
  assert.match(appSource, /data-canvas-tab-id=\{canvas\.id\}/)
  assert.match(appSource, /ref=\{\(element\) => setCanvasTabRef\(canvas\.id, element\)\}/)
})

test('CanvasFlow reports node drag stops so App can move nodes across canvases', () => {
  assert.match(appSource, /onNodeDragToCanvas/)
  assert.match(appSource, /const draggedNodeRef = useRef\(null\)/)
  assert.match(appSource, /const handleNodeDragStart = useCallback/)
  assert.match(appSource, /const handleNodeDrag = useCallback/)
  assert.match(appSource, /const finishNodeDrag = useCallback/)
  assert.match(appSource, /onNodeDragStart=\{handleNodeDragStart\}/)
  assert.match(appSource, /onNodeDrag=\{handleNodeDrag\}/)
  assert.match(appSource, /onNodeDragStop=\{handleNodeDragStop\}/)
  assert.match(appSource, /onNodeDragToCanvas\?\.\(canvas\.id, draggedNode\.id, event, draggedNode\)/)
  assert.match(appSource, /suppressNextCanvasChangeRef\.current = true/)
})

test('App moves a dragged node to a target canvas tab without creating cross-canvas edges', () => {
  assert.match(appSource, /const moveNodeToCanvas = useCallback/)
  assert.match(appSource, /getCanvasIdAtPoint\(event\.clientX, event\.clientY\)/)
  assert.match(appSource, /targetCanvasId === sourceCanvasId/)
  assert.match(appSource, /nodes: canvas\.nodes\.filter\(\(node\) => node\.id !== nodeId\)/)
  assert.match(appSource, /nodes: \[\.\.\.canvas\.nodes, movingNode\]/)
  assert.match(appSource, /movingNodeIds\.has\(edge\.source\) && movingNodeIds\.has\(edge\.target\)/)
  assert.match(appSource, /activeCanvasId: targetCanvasId/)
  assert.match(appSource, /return true/)
})

test('CanvasFlow syncs mounted local React Flow state from parent canvas updates', () => {
  assert.match(appSource, /const lastCanvasPropsRef = useRef\(\{ nodes: canvas\.nodes, edges: canvas\.edges \}\)/)
  assert.match(appSource, /const hydratedNodes = hydrateNodes\(canvas\.nodes\)/)
  assert.match(appSource, /lastSyncedStateRef\.current = \{\s*nodes: hydratedNodes,\s*edges: canvas\.edges\s*\}/)
  assert.match(appSource, /setNodes\(hydratedNodes\)/)
  assert.match(appSource, /setEdges\(canvas\.edges\)/)
})

test('CanvasFlow avoids pushing stale local state while applying parent canvas updates', () => {
  assert.match(appSource, /const skipCanvasChangeRef = useRef\(false\)/)
  assert.match(appSource, /skipCanvasChangeRef\.current = true/)
  assert.match(appSource, /if \(skipCanvasChangeRef\.current\) \{\s*skipCanvasChangeRef\.current = false\s*return\s*\}/)
  assert.match(appSource, /lastCanvasPropsRef\.current = \{ nodes: canvas\.nodes, edges: canvas\.edges \}/)
})

test('CanvasFlow suppresses source canvas writeback after moving a node to another tab', () => {
  assert.match(appSource, /const suppressNextCanvasChangeRef = useRef\(false\)/)
  assert.match(appSource, /suppressNextCanvasChangeRef\.current = true/)
  assert.match(appSource, /if \(suppressNextCanvasChangeRef\.current\) \{\s*suppressNextCanvasChangeRef\.current = false\s*return\s*\}/)
})

test('App enables dragging the minimap viewport to pan the canvas', () => {
  assert.match(appSource, /<MiniMap[\s\S]*position="bottom-left"[\s\S]*pannable/)
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
