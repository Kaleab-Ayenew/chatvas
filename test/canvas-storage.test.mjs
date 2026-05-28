import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const moduleSource = await readFile(new URL('../src/renderer/src/canvasStorage.js', import.meta.url), 'utf8')
const {
  createDefaultCanvas,
  createDefaultCanvasState,
  loadCanvasState,
  saveCanvasState,
  serializeCanvasState
} = await import(`data:text/javascript,${encodeURIComponent(moduleSource)}`)

test('default canvas state starts with one ChatGPT node that stores the full URL', () => {
  const state = createDefaultCanvasState()

  assert.equal(state.activeCanvasId, 'canvas-1')
  assert.equal(state.canvases.length, 1)
  assert.equal(state.canvases[0].name, 'Canvas 1')
  assert.equal(state.canvases[0].nodes[0].data.url, 'https://chatgpt.com')
})

test('serializeCanvasState preserves canvas names, edges, node geometry, and full chat URLs', () => {
  const canvas = createDefaultCanvas({ id: 'canvas-custom', name: 'Research' })
  canvas.nodes[0] = {
    ...canvas.nodes[0],
    id: 'node-chat',
    position: { x: 12, y: 34 },
    width: 710,
    height: 820,
    measured: { width: 710, height: 820 },
    style: { width: 620, height: 750 },
    data: {
      ...canvas.nodes[0].data,
      url: 'https://chatgpt.com/c/abc-123?model=gpt-4.1&temporary-chat=false',
      label: 'Saved Chat'
    }
  }
  canvas.edges = [
    {
      id: 'edge-node-chat-node-branch',
      source: 'node-chat',
      target: 'node-branch',
      animated: true,
      style: { stroke: 'var(--accent)', strokeWidth: 2 }
    }
  ]

  const serialized = serializeCanvasState({ activeCanvasId: 'canvas-custom', canvases: [canvas] })

  assert.deepEqual(serialized, {
    activeCanvasId: 'canvas-custom',
    canvases: [
      {
        id: 'canvas-custom',
        name: 'Research',
        nodes: [
          {
            id: 'node-chat',
            type: 'chatNode',
            position: { x: 12, y: 34 },
            width: 710,
            height: 820,
            measured: { width: 710, height: 820 },
            style: { width: 620, height: 750 },
            data: {
              url: 'https://chatgpt.com/c/abc-123?model=gpt-4.1&temporary-chat=false',
              label: 'Saved Chat'
            },
            dragHandle: '.chat-node-header'
          }
        ],
        edges: [
          {
            id: 'edge-node-chat-node-branch',
            source: 'node-chat',
            target: 'node-branch',
            animated: true,
            style: { stroke: 'var(--accent)', strokeWidth: 2 }
          }
        ]
      }
    ]
  })
})

test('loadCanvasState falls back to a default canvas when storage is empty or invalid', () => {
  const emptyStorage = { getItem: () => null, setItem: () => {} }
  assert.equal(loadCanvasState(emptyStorage).canvases[0].name, 'Canvas 1')

  const invalidStorage = { getItem: () => '{not valid json', setItem: () => {} }
  assert.equal(loadCanvasState(invalidStorage).canvases[0].nodes[0].data.url, 'https://chatgpt.com')
})

test('saveCanvasState writes serialized canvas state to localStorage', () => {
  let storedKey = null
  let storedValue = null
  const storage = {
    setItem(key, value) {
      storedKey = key
      storedValue = value
    }
  }
  const state = createDefaultCanvasState()
  state.canvases[0].name = 'Renamed Canvas'

  saveCanvasState(storage, state)

  assert.equal(storedKey, 'chatvas.canvasState.v1')
  assert.equal(JSON.parse(storedValue).canvases[0].name, 'Renamed Canvas')
})
