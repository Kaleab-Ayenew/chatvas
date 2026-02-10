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

let nodeIdCounter = 1
const getNextNodeId = () => `node-${++nodeIdCounter}`

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

  // Stable ref for handleBranch (avoids circular dep with initial node data)
  const handleBranchRef = useRef(null)
  const handleCloseRef = useRef(null)

  const onBranchStable = useCallback(
    (url, sourceNodeId) => handleBranchRef.current?.(url, sourceNodeId),
    []
  )
  const onCloseStable = useCallback(
    (nodeId) => handleCloseRef.current?.(nodeId),
    []
  )

  // --- React Flow state ---
  const [nodes, setNodes, onNodesChange] = useNodesState([
    {
      id: 'node-1',
      type: 'chatNode',
      position: { x: 0, y: 0 },
      data: {
        url: 'https://chatgpt.com',
        label: 'ChatGPT',
        registerWebview,
        unregisterWebview,
        onBranch: (url, sourceNodeId) => handleBranchRef.current?.(url, sourceNodeId),
        onClose: (nodeId) => handleCloseRef.current?.(nodeId)
      },
      dragHandle: '.chat-node-header'
    }
  ])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const nodeTypes = useMemo(() => ({ chatNode: ChatNode }), [])

  // --- Close a node and its connected edges ---
  const handleClose = useCallback(
    (nodeId) => {
      unregisterWebview(nodeId)
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    },
    [unregisterWebview, setNodes, setEdges]
  )
  handleCloseRef.current = handleClose

  // --- Branch handler ---
  const handleBranch = useCallback(
    (url, sourceNodeId) => {
      const newId = getNextNodeId()

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
              onClose: onCloseStable
            },
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

      return newId
    },
    [registerWebview, unregisterWebview, onBranchStable, onCloseStable, setNodes, setEdges]
  )
  handleBranchRef.current = handleBranch

  // --- Fallback: listen for branch events from Electron main process via IPC ---
  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.onNewBranch(({ url, sourceWebContentsId }) => {
      const sourceNodeId = webContentsMapRef.current.get(sourceWebContentsId)
      handleBranch(url, sourceNodeId || 'node-1')
    })

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeNewBranchListener()
      }
    }
  }, [handleBranch])

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
          onClose: onCloseStable
        },
        dragHandle: '.chat-node-header'
      }
    ])
  }, [registerWebview, unregisterWebview, onBranchStable, onCloseStable, setNodes])

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
              onClick={() => setThemeName(key)}
              title={t.label}
            />
          ))}
        </div>
      </div>
      <ReactFlow
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
