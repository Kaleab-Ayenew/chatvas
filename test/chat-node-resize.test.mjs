import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const chatNodeSource = await readFile(
  new URL('../src/renderer/src/components/ChatNode.jsx', import.meta.url),
  'utf8'
)
const canvasStorageSource = await readFile(
  new URL('../src/renderer/src/canvasStorage.js', import.meta.url),
  'utf8'
)
const chatNodeCss = await readFile(
  new URL('../src/renderer/src/components/ChatNode.css', import.meta.url),
  'utf8'
)
const appSource = await readFile(new URL('../src/renderer/src/App.jsx', import.meta.url), 'utf8')

test('chat nodes expose React Flow resize controls', () => {
  assert.match(chatNodeSource, /import\s*\{[^}]*NodeResizer[^}]*\}\s*from\s*['"]@xyflow\/react['"]/)
  assert.match(chatNodeSource, /<NodeResizer\b/)
  assert.match(chatNodeSource, /minWidth=\{360\}/)
  assert.match(chatNodeSource, /minHeight=\{420\}/)
})

test('chat nodes persist full URLs from in-page ChatGPT navigation', () => {
  assert.match(chatNodeSource, /did-navigate-in-page/)
  assert.match(chatNodeSource, /persistCurrentUrl/)
  assert.match(chatNodeSource, /webview\.getURL\?\.\(\)/)
})

test('chat node URL persistence avoids repeated effect loops for unchanged URLs', () => {
  assert.match(chatNodeSource, /currentUrlRef/)
  assert.match(chatNodeSource, /currentUrlRef\.current === url/)
  assert.doesNotMatch(chatNodeSource, /\}, \[id, data\]\)/)
})

test('new chat nodes start with default dimensions managed by React Flow', () => {
  assert.match(canvasStorageSource, /DEFAULT_NODE_SIZE\s*=\s*\{\s*width:\s*620,\s*height:\s*750\s*\}/s)
  assert.match(canvasStorageSource, /style:\s*DEFAULT_NODE_SIZE/)

  assert.doesNotMatch(chatNodeCss, /\.chat-node\s*\{[^}]*\bwidth:\s*620px/s)
  assert.doesNotMatch(chatNodeCss, /\.chat-node\s*\{[^}]*\bheight:\s*750px/s)
})

test('chat node handles stay above embedded webviews for manual connections', () => {
  assert.match(chatNodeCss, /\.chat-handle\s*\{[^}]*z-index:\s*10/s)
})

test('chat node resize gestures disable embedded webview pointer events', () => {
  assert.match(chatNodeSource, /onResizeStart=\{data\.onResizeStart\}/)
  assert.match(chatNodeSource, /onResizeEnd=\{data\.onResizeEnd\}/)
  assert.match(appSource, /onResizeStart: onCanvasGestureStart/)
  assert.match(appSource, /onResizeEnd: onCanvasGestureEnd/)
  assert.match(appSource, /const \[isCanvasGestureActive, setIsCanvasGestureActive\] = useState\(false\)/)
  assert.match(appSource, /className=\{isCanvasGestureActive \? 'canvas-flow-gesture-active' : undefined\}/)
})

test('native branch nodes use a host placeholder instead of creating a new webview', () => {
  assert.match(chatNodeSource, /data\.nativeViewId/)
  assert.match(chatNodeSource, /native-branch-host/)
  assert.match(chatNodeSource, /window\.electronAPI\.setBranchViewBounds/)
  assert.doesNotMatch(chatNodeSource, /useEffect\(\(\) => \{\s*return \(\) => \{\s*if \(data\.nativeViewId && window\.electronAPI\?\.closeBranchView\)/)
  assert.match(chatNodeSource, /if \(data\.nativeViewId\)[\s\S]*return/)
})

test('native branch views close only when users close the node', () => {
  assert.match(chatNodeSource, /const handleCloseNode = \(\) => \{/)
  assert.match(chatNodeSource, /window\.electronAPI\?\.closeBranchView\?\.\(data\.nativeViewId\)/)
  assert.match(chatNodeSource, /callbacksRef\.current\.onClose\?\.\(id\)/)
})

test('native branch bounds include untransformed content size, canvas scale, and node stacking', () => {
  assert.match(chatNodeSource, /host\.offsetWidth/)
  assert.match(chatNodeSource, /host\.offsetHeight/)
  assert.match(chatNodeSource, /scale: Number\.isFinite\(scale\) && scale > 0 \? scale : 1/)
  assert.match(chatNodeSource, /contentWidth: host\.offsetWidth/)
  assert.match(chatNodeSource, /contentHeight: host\.offsetHeight/)
  assert.match(chatNodeSource, /stackingOrder: getNativeHostStackingOrder\(host\)/)
})

test('native branch bounds sync is event-driven instead of a permanent animation loop', () => {
  assert.match(chatNodeSource, /const scheduleNativeBoundsSync = \(\) => \{/)
  assert.match(chatNodeSource, /new ResizeObserver\(scheduleNativeBoundsSync\)/)
  assert.match(chatNodeSource, /new MutationObserver\(scheduleNativeBoundsSync\)/)
  assert.doesNotMatch(
    chatNodeSource,
    /frameId = requestAnimationFrame\(syncNativeBounds\)[\s\S]*frameId = requestAnimationFrame\(syncNativeBounds\)/
  )
})

test('native branch bounds sync observes React Flow viewport transforms and pane visibility', () => {
  assert.match(chatNodeSource, /closest\('\.react-flow__viewport'\)/)
  assert.match(chatNodeSource, /closest\('\.canvas-flow-pane'\)/)
  assert.match(chatNodeSource, /const observedMutationTargets = \[/)
  assert.match(chatNodeSource, /observedMutationTargets\.filter\(Boolean\)\.forEach/)
})

test('native branch bounds sync skips unchanged bounds before sending IPC', () => {
  assert.match(chatNodeSource, /lastNativeBoundsKeyRef/)
  assert.match(chatNodeSource, /const boundsKey = nativeBoundsKey\(bounds\)/)
  assert.match(chatNodeSource, /if \(lastNativeBoundsKeyRef\.current === boundsKey\) return/)
  assert.match(chatNodeSource, /lastNativeBoundsKeyRef\.current = boundsKey/)
})

test('native branch nodes resolve their React Flow stacking order from the DOM', () => {
  assert.match(chatNodeSource, /function getNativeHostStackingOrder\(host\)/)
  assert.match(chatNodeSource, /closest\('\.react-flow__node'\)/)
  assert.match(chatNodeSource, /window\.getComputedStyle\(nodeElement\)\.zIndex/)
  assert.match(chatNodeSource, /parentElement\?\.children/)
  assert.match(chatNodeSource, /\* 10000 \+ siblingIndex/)
})
