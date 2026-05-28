export const CANVAS_STORAGE_KEY = 'chatvas.canvasState.v1'
export const DEFAULT_NODE_SIZE = { width: 620, height: 750 }

export function createDefaultNode({ id = 'node-1', label = 'ChatGPT', url = 'https://chatgpt.com', position = { x: 0, y: 0 } } = {}) {
  return {
    id,
    type: 'chatNode',
    position,
    data: { url, label },
    style: DEFAULT_NODE_SIZE,
    dragHandle: '.chat-node-header'
  }
}

export function createDefaultCanvas({ id = 'canvas-1', name = 'Canvas 1' } = {}) {
  return {
    id,
    name,
    nodes: [createDefaultNode()],
    edges: []
  }
}

export function createDefaultCanvasState() {
  const canvas = createDefaultCanvas()
  return {
    activeCanvasId: canvas.id,
    canvases: [canvas]
  }
}

function serializeNode(node) {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    width: node.width,
    height: node.height,
    measured: node.measured,
    style: node.style,
    data: {
      url: node.data?.url,
      label: node.data?.label
    },
    dragHandle: node.dragHandle
  }
}

export function serializeCanvasState(state) {
  return {
    activeCanvasId: state.activeCanvasId,
    canvases: state.canvases.map((canvas) => ({
      id: canvas.id,
      name: canvas.name,
      nodes: canvas.nodes.map(serializeNode),
      edges: canvas.edges
    }))
  }
}

function isValidCanvasState(value) {
  return (
    value &&
    typeof value.activeCanvasId === 'string' &&
    Array.isArray(value.canvases) &&
    value.canvases.length > 0
  )
}

export function loadCanvasState(storage) {
  try {
    const raw = storage?.getItem(CANVAS_STORAGE_KEY)
    if (!raw) return createDefaultCanvasState()

    const parsed = JSON.parse(raw)
    if (!isValidCanvasState(parsed)) return createDefaultCanvasState()

    return parsed
  } catch {
    return createDefaultCanvasState()
  }
}

export function saveCanvasState(storage, state) {
  storage?.setItem(CANVAS_STORAGE_KEY, JSON.stringify(serializeCanvasState(state)))
}
