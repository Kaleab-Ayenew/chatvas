import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
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
const nodeTypes = { chatNode: ChatNode }
const defaultEdgeOptions = {
  animated: true,
  style: { stroke: 'var(--accent)', strokeWidth: 2 }
}
const proOptions = { hideAttribution: true }
const chatServices = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'deepseek', label: 'DeepSeek', url: 'https://chat.deepseek.com' },
  { id: 'doubao', label: '豆包', url: 'https://www.doubao.com/chat' }
]

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

function CanvasFlow({
  canvas,
  isActive,
  registerWebview,
  unregisterWebview,
  onCanvasChange,
  onCanvasBranchHandlerChange
}) {
  const handleBranchRef = useRef(null)
  const handleCloseRef = useRef(null)
  const handleUrlChangeRef = useRef(null)

  const canvasRegisterWebview = useCallback(
    (nodeId, wcId) => registerWebview(canvas.id, nodeId, wcId),
    [canvas.id, registerWebview]
  )
  const canvasUnregisterWebview = useCallback(
    (nodeId) => unregisterWebview(canvas.id, nodeId),
    [canvas.id, unregisterWebview]
  )

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
          registerWebview: canvasRegisterWebview,
          unregisterWebview: canvasUnregisterWebview,
          onBranch: onBranchStable,
          onClose: onCloseStable,
          onUrlChange: onUrlChangeStable
        }
      })),
    [
      canvasRegisterWebview,
      canvasUnregisterWebview,
      onBranchStable,
      onCloseStable,
      onUrlChangeStable
    ]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(hydrateNodes(canvas.nodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState(canvas.edges)
  const lastSyncedStateRef = useRef({ nodes, edges })

  useEffect(() => {
    if (lastSyncedStateRef.current.nodes === nodes && lastSyncedStateRef.current.edges === edges) return

    lastSyncedStateRef.current = { nodes, edges }
    onCanvasChange(canvas.id, nodes, edges)
  }, [canvas.id, nodes, edges, onCanvasChange])

  const handleClose = useCallback(
    (nodeId) => {
      canvasUnregisterWebview(nodeId)
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      trackEvent('node_closed', { node_id: nodeId, canvas_id: canvas.id })
    },
    [canvas.id, canvasUnregisterWebview, setNodes, setEdges]
  )
  handleCloseRef.current = handleClose

  const handleUrlChange = useCallback(
    (nodeId, url) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? node.data?.url === url
              ? node
              : { ...node, data: { ...node.data, url } }
            : node
        )
      )
    },
    [setNodes]
  )
  handleUrlChangeRef.current = handleUrlChange

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
            position: isBranch
              ? {
                  x: baseX + 700,
                  y: baseY + Math.random() * 300 - 150
                }
              : {
                  x: Math.random() * 800 - 400,
                  y: Math.random() * 600 - 300
                },
            data: {
              url,
              label: isBranch ? `Branch from ${sourceNodeId}` : 'New Chat',
              registerWebview: canvasRegisterWebview,
              unregisterWebview: canvasUnregisterWebview,
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
        canvas_id: canvas.id
      })

      return newId
    },
    [
      canvas.id,
      canvasRegisterWebview,
      canvasUnregisterWebview,
      onBranchStable,
      onCloseStable,
      onUrlChangeStable,
      setNodes,
      setEdges
    ]
  )
  handleBranchRef.current = handleBranch

  useEffect(() => {
    onCanvasBranchHandlerChange(canvas.id, handleBranch)
    return () => onCanvasBranchHandlerChange(canvas.id, null)
  }, [canvas.id, handleBranch, onCanvasBranchHandlerChange])

  const handleNodesDelete = useCallback(
    (deleted) => {
      for (const node of deleted) {
        canvasUnregisterWebview(node.id)
      }
    },
    [canvasUnregisterWebview]
  )

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={handleNodesDelete}
        nodeTypes={nodeTypes}
        fitView={isActive}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={proOptions}
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
    </ReactFlowProvider>
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
  const branchHandlersRef = useRef(new Map())

  const registerWebview = useCallback((canvasId, nodeId, wcId) => {
    webContentsMapRef.current.set(wcId, { canvasId, nodeId })
  }, [])

  const unregisterWebview = useCallback((canvasId, nodeId) => {
    for (const [wcId, entry] of webContentsMapRef.current.entries()) {
      if (entry.canvasId === canvasId && entry.nodeId === nodeId) {
        webContentsMapRef.current.delete(wcId)
      }
    }
  }, [])

  const [canvasState, setCanvasState] = useState(() => {
    const loaded = loadCanvasState(window.localStorage)
    syncIdCounters(loaded)
    return loaded
  })
  const [recentCanvasId, setRecentCanvasId] = useState(null)
  const [renamingCanvasId, setRenamingCanvasId] = useState(null)
  const [draftCanvasName, setDraftCanvasName] = useState('')
  const [isChatServicePickerOpen, setIsChatServicePickerOpen] = useState(false)
  const skipRenameOnBlurRef = useRef(false)

  const visibleCanvasIds = useMemo(() => {
    const ids = [canvasState.activeCanvasId]
    if (recentCanvasId && recentCanvasId !== canvasState.activeCanvasId) ids.push(recentCanvasId)
    return ids
  }, [canvasState.activeCanvasId, recentCanvasId])

  const visibleCanvases = useMemo(
    () =>
      visibleCanvasIds
        .map((canvasId) => canvasState.canvases.find((canvas) => canvas.id === canvasId))
        .filter(Boolean),
    [canvasState.canvases, visibleCanvasIds]
  )

  useEffect(() => {
    saveCanvasState(window.localStorage, canvasState)
  }, [canvasState])

  const handleCanvasChange = useCallback((canvasId, nodes, edges) => {
    setCanvasState((current) => {
      let changed = false
      const canvases = current.canvases.map((canvas) => {
        if (canvas.id !== canvasId) return canvas
        if (canvas.nodes === nodes && canvas.edges === edges) return canvas

        changed = true
        return { ...canvas, nodes, edges }
      })

      return changed ? { ...current, canvases } : current
    })
  }, [])

  const handleCanvasBranchHandlerChange = useCallback((canvasId, handler) => {
    if (handler) {
      branchHandlersRef.current.set(canvasId, handler)
    } else {
      branchHandlersRef.current.delete(canvasId)
    }
  }, [])

  const switchCanvas = useCallback(
    (canvasId) => {
      if (canvasId === canvasState.activeCanvasId) return

      setRecentCanvasId(canvasState.activeCanvasId)
      setCanvasState((current) => ({
        ...current,
        activeCanvasId: canvasId
      }))
    },
    [canvasState.activeCanvasId]
  )

  const handleAddCanvas = useCallback(() => {
    const canvas = createDefaultCanvas({
      id: getNextCanvasId(),
      name: `Canvas ${canvasState.canvases.length + 1}`
    })
    canvas.nodes = [createDefaultNode({ id: getNextNodeId() })]

    setRecentCanvasId(canvasState.activeCanvasId)
    setCanvasState((current) => ({
      activeCanvasId: canvas.id,
      canvases: [...current.canvases, canvas]
    }))
  }, [canvasState.activeCanvasId, canvasState.canvases.length])

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

  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.onNewBranch(({ url, sourceWebContentsId }) => {
      const source = webContentsMapRef.current.get(sourceWebContentsId)
      const canvasId = source?.canvasId || canvasState.activeCanvasId
      const sourceNodeId = source?.nodeId || null
      branchHandlersRef.current.get(canvasId)?.(url, sourceNodeId)
    })

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeNewBranchListener()
      }
    }
  }, [canvasState.activeCanvasId])

  const createChatForService = useCallback(
    (service) => {
      branchHandlersRef.current.get(canvasState.activeCanvasId)?.(service.url, null)
      setIsChatServicePickerOpen(false)
    },
    [canvasState.activeCanvasId]
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
        <button className="add-chat-btn" onClick={() => setIsChatServicePickerOpen(true)}>
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
      {isChatServicePickerOpen && (
        <div className="chat-service-picker" role="dialog" aria-label="Choose chat service">
          <div className="chat-service-picker-card">
            <div className="chat-service-picker-title">Choose chat service</div>
            <div className="chat-service-options">
              {chatServices.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className="chat-service-option"
                  onClick={() => createChatForService(service)}
                >
                  {service.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="chat-service-cancel"
              onClick={() => setIsChatServicePickerOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {visibleCanvases.map((canvas) => (
        <div
          key={canvas.id}
          className="canvas-flow-pane"
          style={{ display: canvas.id === canvasState.activeCanvasId ? 'block' : 'none' }}
        >
          <CanvasFlow
            canvas={canvas}
            isActive={canvas.id === canvasState.activeCanvasId}
            registerWebview={registerWebview}
            unregisterWebview={unregisterWebview}
            onCanvasChange={handleCanvasChange}
            onCanvasBranchHandlerChange={handleCanvasBranchHandlerChange}
          />
        </div>
      ))}
    </div>
  )
}

export default App
