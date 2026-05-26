import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ChatNode from './components/ChatNode'
import themes from './themes'
import { analyticsStatus, trackEvent } from './analytics'
import {
  createDefaultCanvas,
  createDefaultNode,
  loadCanvasState,
  saveCanvasState
} from './canvasStorage'

let nodeIdCounter = 1
let canvasIdCounter = 1
const getNextNodeId = () => `node-${++nodeIdCounter}`
const getNextCanvasId = () => `canvas-${++canvasIdCounter}`
const defaultNodeSize = { width: 620, height: 750 }

function syncIdCounters(canvasState) {
  for (const canvas of canvasState.canvases) {
    const canvasMatch = /^canvas-(\d+)$/.exec(canvas.id)
    if (canvasMatch) canvasIdCounter = Math.max(canvasIdCounter, Number(canvasMatch[1]))

    for (const node of canvas.nodes) {
      const nodeMatch = /^node-(\d+)$/.exec(node.id)
      if (nodeMatch) nodeIdCounter = Math.max(nodeIdCounter, Number(nodeMatch[1]))
    }
  }
}

function getActiveCanvas(canvasState) {
  return (
    canvasState.canvases.find((canvas) => canvas.id === canvasState.activeCanvasId) ||
    canvasState.canvases[0]
  )
}

// Swatch preview colors (the canvas bg for each theme)
const swatchColors = {
  midnight: '#0f0f1a',
  nord: '#2e3440',
  rosePine: '#191724',
  solarizedDark: '#002b36',
  light: '#f5f5f5'
}

function App() {
  // --- Theme state ---
  const [themeName, setThemeName] = useState('midnight')
  const theme = themes[themeName]

  useEffect(() => {
    const { enabled, host } = analyticsStatus()
    if (!enabled) return

    trackEvent('app_opened', {
      platform: navigator.platform,
      user_agent: navigator.userAgent,
      host
    })
  }, [])

  // Apply theme CSS vars to :root whenever theme changes
  useEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme)) {
      if (key.startsWith('--')) {
        root.style.setProperty(key, value)
      }
    }
  }, [theme])

  // --- Webview <-> Node mapping ---
  const webContentsMapRef = useRef(new Map())

  const registerWebview = useCallback((nodeId, wcId) => {
    webContentsMapRef.current.set(wcId, nodeId)
  }, [])

  const unregisterWebview = useCallback((nodeId) => {
    for (const [wcId, nId] of webContentsMapRef.current.entries()) {
      if (nId === nodeId) {
        webContentsMapRef.current.delete(wcId)
      }
    }
  }, [])

  // Stable ref for node callbacks (avoids circular deps with persisted node data)
  const handleBranchRef = useRef(null)
  const handleCloseRef = useRef(null)
  const handleUrlChangeRef = useRef(null)
  const skipRenameOnBlurRef = useRef(false)

  const onBranchStable = useCallback(
    (url, sourceNodeId) => handleBranchRef.current?.(url, sourceNodeId),
    []
  )
  const onCloseStable = useCallback(
    (nodeId) => handleCloseRef.current?.(nodeId),
    []
  )
  const onUrlChangeStable = useCallback(
    (nodeId, url) => handleUrlChangeRef.current?.(nodeId, url),
    []
  )

  const hydrateNodes = useCallback(
    (storedNodes) =>
      storedNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          registerWebview,
          unregisterWebview,
          onBranch: onBranchStable,
          onClose: onCloseStable,
          onUrlChange: onUrlChangeStable
        }
      })),
    [registerWebview, unregisterWebview, onBranchStable, onCloseStable, onUrlChangeStable]
  )

  const [canvasState, setCanvasState] = useState(() => {
    const loaded = loadCanvasState(window.localStorage)
    syncIdCounters(loaded)
    return loaded
  })
  const activeCanvas = getActiveCanvas(canvasState)
  const [renamingCanvasId, setRenamingCanvasId] = useState(null)
  const [draftCanvasName, setDraftCanvasName] = useState('')

  // --- React Flow state ---
  const [nodes, setNodes, onNodesChange] = useNodesState(hydrateNodes(activeCanvas.nodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState(activeCanvas.edges)

  const nodeTypes = useMemo(() => ({ chatNode: ChatNode }), [])

  useEffect(() => {
    setCanvasState((current) => ({
      ...current,
      canvases: current.canvases.map((canvas) =>
        canvas.id === current.activeCanvasId ? { ...canvas, nodes, edges } : canvas
      )
    }))
  }, [nodes, edges])

  useEffect(() => {
    saveCanvasState(window.localStorage, canvasState)
  }, [canvasState])

  const switchCanvas = useCallback(
    (canvasId) => {
      if (canvasId === canvasState.activeCanvasId) return

      const nextCanvasState = {
        ...canvasState,
        activeCanvasId: canvasId,
        canvases: canvasState.canvases.map((canvas) =>
          canvas.id === canvasState.activeCanvasId ? { ...canvas, nodes, edges } : canvas
        )
      }
      const nextCanvas = getActiveCanvas(nextCanvasState)

      webContentsMapRef.current.clear()
      setCanvasState(nextCanvasState)
      setNodes(hydrateNodes(nextCanvas.nodes))
      setEdges(nextCanvas.edges)
    },
    [canvasState, nodes, edges, hydrateNodes, setNodes, setEdges]
  )

  const handleAddCanvas = useCallback(() => {
    const canvas = createDefaultCanvas({
      id: getNextCanvasId(),
      name: `Canvas ${canvasState.canvases.length + 1}`
    })
    canvas.nodes = [createDefaultNode({ id: getNextNodeId() })]

    const nextCanvasState = {
      activeCanvasId: canvas.id,
      canvases: [
        ...canvasState.canvases.map((existingCanvas) =>
          existingCanvas.id === canvasState.activeCanvasId
            ? { ...existingCanvas, nodes, edges }
            : existingCanvas
        ),
        canvas
      ]
    }

    webContentsMapRef.current.clear()
    setCanvasState(nextCanvasState)
    setNodes(hydrateNodes(canvas.nodes))
    setEdges(canvas.edges)
  }, [canvasState, nodes, edges, hydrateNodes, setNodes, setEdges])

  const startRenamingCanvas = useCallback((canvas) => {
    skipRenameOnBlurRef.current = false
    setRenamingCanvasId(canvas.id)
    setDraftCanvasName(canvas.name)
  }, [])

  const cancelRenamingCanvas = useCallback(() => {
    skipRenameOnBlurRef.current = true
    setRenamingCanvasId(null)
    setDraftCanvasName('')
  }, [])

  const renameCanvas = useCallback(() => {
    if (skipRenameOnBlurRef.current) {
      skipRenameOnBlurRef.current = false
      return
    }
    if (!renamingCanvasId) return

    const nextName = draftCanvasName.trim()
    setCanvasState((current) => ({
      ...current,
      canvases: current.canvases.map((canvas) =>
        canvas.id === renamingCanvasId && nextName ? { ...canvas, name: nextName } : canvas
      )
    }))
    setRenamingCanvasId(null)
    setDraftCanvasName('')
  }, [renamingCanvasId, draftCanvasName])

  // --- Close a node and its connected edges ---
  const handleClose = useCallback(
    (nodeId) => {
      unregisterWebview(nodeId)
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      trackEvent('node_closed', { node_id: nodeId })
    },
    [unregisterWebview, setNodes, setEdges]
  )
  handleCloseRef.current = handleClose

  const handleUrlChange = useCallback(
    (nodeId, url) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, url } } : node
        )
      )
    },
    [setNodes]
  )
  handleUrlChangeRef.current = handleUrlChange

  // --- Branch handler ---
  const handleBranch = useCallback(
    (url, sourceNodeId) => {
      const newId = getNextNodeId()
      const isBranch = Boolean(sourceNodeId)

      setNodes((currentNodes) => {
        const sourceNode = currentNodes.find((n) => n.id === sourceNodeId)
        const baseX = sourceNode ? sourceNode.position.x : 0
        const baseY = sourceNode ? sourceNode.position.y : 0

        return [
          ...currentNodes,
          {
            id: newId,
            type: 'chatNode',
            position: {
              x: baseX + 700,
              y: baseY + Math.random() * 300 - 150
            },
            data: {
              url,
              label: `Branch from ${sourceNodeId}`,
              registerWebview,
              unregisterWebview,
              onBranch: onBranchStable,
              onClose: onCloseStable,
              onUrlChange: onUrlChangeStable
            },
            style: defaultNodeSize,
            dragHandle: '.chat-node-header'
          }
        ]
      })

      if (sourceNodeId) {
        setEdges((currentEdges) => [
          ...currentEdges,
          {
            id: `edge-${sourceNodeId}-${newId}`,
            source: sourceNodeId,
            target: newId,
            animated: true,
            style: { stroke: 'var(--accent)', strokeWidth: 2 }
          }
        ])
      }

      trackEvent(isBranch ? 'branch_created' : 'node_created', {
        node_id: newId,
        source_node_id: sourceNodeId || null,
        source_url: url,
        canvas_id: canvasState.activeCanvasId
      })

      return newId
    },
    [
      registerWebview,
      unregisterWebview,
      onBranchStable,
      onCloseStable,
      onUrlChangeStable,
      setNodes,
      setEdges,
      canvasState.activeCanvasId
    ]
  )
  handleBranchRef.current = handleBranch

  // --- Fallback: listen for branch events from Electron main process via IPC ---
  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.onNewBranch(({ url, sourceWebContentsId }) => {
      const sourceNodeId = webContentsMapRef.current.get(sourceWebContentsId)
      handleBranch(url, sourceNodeId || nodes[0]?.id || 'node-1')
    })

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeNewBranchListener()
      }
    }
  }, [handleBranch, nodes])

  // --- Add a fresh root ChatGPT node ---
  const handleAddRootNode = useCallback(() => {
    const newId = getNextNodeId()
    setNodes((nds) => [
      ...nds,
      {
        id: newId,
        type: 'chatNode',
        position: {
          x: Math.random() * 800 - 400,
          y: Math.random() * 600 - 300
        },
        data: {
          url: 'https://chatgpt.com',
          label: 'New Chat',
          registerWebview,
          unregisterWebview,
          onBranch: onBranchStable,
          onClose: onCloseStable,
          onUrlChange: onUrlChangeStable
        },
        style: defaultNodeSize,
        dragHandle: '.chat-node-header'
      }
    ])
    trackEvent('node_created', {
      node_id: newId,
      source_node_id: null,
      source_url: 'https://chatgpt.com',
      canvas_id: canvasState.activeCanvasId
    })
  }, [
    registerWebview,
    unregisterWebview,
    onBranchStable,
    onCloseStable,
    onUrlChangeStable,
    setNodes,
    canvasState.activeCanvasId
  ])

  // --- Delete nodes via keyboard ---
  const handleNodesDelete = useCallback(
    (deleted) => {
      for (const node of deleted) {
        unregisterWebview(node.id)
      }
    },
    [unregisterWebview]
  )

  return (
    <div className="app-container">
      <div className="toolbar">
        <div className="canvas-tabs" aria-label="Canvases">
          {canvasState.canvases.map((canvas) =>
            renamingCanvasId === canvas.id ? (
              <input
                key={canvas.id}
                className="canvas-tab-input"
                value={draftCanvasName}
                autoFocus
                onFocus={(event) => event.target.select()}
                onChange={(event) => setDraftCanvasName(event.target.value)}
                onBlur={renameCanvas}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') renameCanvas()
                  if (event.key === 'Escape') cancelRenamingCanvas()
                }}
              />
            ) : (
              <button
                key={canvas.id}
                type="button"
                className={`canvas-tab ${canvas.id === canvasState.activeCanvasId ? 'active' : ''}`}
                onClick={() => switchCanvas(canvas.id)}
                onDoubleClick={() => startRenamingCanvas(canvas)}
                title="Double-click to rename"
              >
                {canvas.name}
              </button>
            )
          )}
          <button className="add-canvas-btn" onClick={handleAddCanvas} title="New canvas">
            +
          </button>
        </div>
        <button className="add-chat-btn" onClick={handleAddRootNode}>
          + New Chat
        </button>
        <span className="toolbar-hint">Drag header to move. Scroll to zoom.</span>
        <div className="theme-picker">
          {Object.entries(themes).map(([key, t]) => (
            <button
              key={key}
              className={`theme-swatch ${themeName === key ? 'active' : ''}`}
              style={{ background: swatchColors[key] }}
              onClick={() => {
                setThemeName(key)
                trackEvent('theme_changed', { theme: key })
              }}
              title={t.label}
            />
          ))}
        </div>
      </div>
      <ReactFlow
        key={canvasState.activeCanvasId}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={handleNodesDelete}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: 'var(--accent)', strokeWidth: 2 }
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={20} size={1} color="var(--dots-color)" />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor="var(--accent)"
          maskColor="var(--minimap-mask)"
          style={{ backgroundColor: 'var(--minimap-bg)' }}
          position="bottom-left"
        />
      </ReactFlow>
    </div>
  )
}

export default App
