import { useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position } from '@xyflow/react'
import './ChatNode.css'
import { trackEvent } from '../analytics'

function getNativeHostStackingOrder(host) {
  const nodeElement = host.closest('.react-flow__node')
  const zIndex = Number.parseInt(window.getComputedStyle(nodeElement).zIndex, 10)
  const siblingIndex = nodeElement?.parentElement?.children
    ? Array.from(nodeElement.parentElement.children).indexOf(nodeElement)
    : 0
  return (Number.isFinite(zIndex) ? zIndex : 0) * 10000 + siblingIndex
}

function nativeBoundsKey(bounds) {
  return [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    bounds.contentWidth,
    bounds.contentHeight,
    bounds.scale,
    bounds.stackingOrder
  ].join(':')
}

function ChatNode({ id, data, selected }) {
  const webviewRef = useRef(null)
  const nativeHostRef = useRef(null)
  const lastNativeBoundsKeyRef = useRef(null)
  const currentUrlRef = useRef(data.url)
  const callbacksRef = useRef(data)
  const [title, setTitle] = useState(data.label || 'Chat')
  const [isLoading, setIsLoading] = useState(!data.nativeViewId)
  const [currentUrl, setCurrentUrl] = useState(data.url)

  callbacksRef.current = data

  useEffect(() => {
    if (!data.nativeViewId) return

    let frameId = null
    const syncNativeBounds = () => {
      frameId = null
      const host = nativeHostRef.current
      if (!host || !window.electronAPI?.setBranchViewBounds) return

      const rect = host.getBoundingClientRect()
      const scale = rect.width / host.offsetWidth
      const bounds = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        contentWidth: host.offsetWidth,
        contentHeight: host.offsetHeight,
        scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        stackingOrder: getNativeHostStackingOrder(host)
      }
      const boundsKey = nativeBoundsKey(bounds)
      if (lastNativeBoundsKeyRef.current === boundsKey) return

      lastNativeBoundsKeyRef.current = boundsKey
      window.electronAPI.setBranchViewBounds(data.nativeViewId, bounds)
    }

    const scheduleNativeBoundsSync = () => {
      if (frameId) return
      frameId = requestAnimationFrame(syncNativeBounds)
    }

    const resizeObserver = new ResizeObserver(scheduleNativeBoundsSync)
    const mutationObserver = new MutationObserver(scheduleNativeBoundsSync)
    if (nativeHostRef.current) {
      resizeObserver.observe(nativeHostRef.current)
      const observedMutationTargets = [
        nativeHostRef.current.closest('.react-flow__node'),
        nativeHostRef.current.closest('.react-flow__viewport'),
        nativeHostRef.current.closest('.canvas-flow-pane')
      ]
      observedMutationTargets.filter(Boolean).forEach((target) => {
        mutationObserver.observe(target, {
          attributes: true,
          attributeFilter: ['style', 'class']
        })
      })
    }
    window.addEventListener('resize', scheduleNativeBoundsSync)
    window.addEventListener('focus', scheduleNativeBoundsSync)
    scheduleNativeBoundsSync()

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleNativeBoundsSync)
      window.removeEventListener('focus', scheduleNativeBoundsSync)
      lastNativeBoundsKeyRef.current = null
      window.electronAPI?.setBranchViewBounds?.(data.nativeViewId, {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        contentWidth: 0,
        contentHeight: 0,
        scale: 1,
        stackingOrder: 0
      })
    }
  }, [data.nativeViewId])

  useEffect(() => {
    if (data.nativeViewId) return

    const webview = webviewRef.current
    if (!webview) return

    // Ensure allowpopups is set imperatively (React may not set it correctly)
    webview.setAttribute('allowpopups', '')

    const onDomReady = () => {
      setIsLoading(false)
      // Register this webview so the app knows which node it belongs to
      if (callbacksRef.current.registerWebview) {
        try {
          const wcId = webview.getWebContentsId()
          callbacksRef.current.registerWebview(id, wcId)
        } catch (e) {
          console.warn('Could not get webContentsId:', e)
        }
      }
    }

    const onPageTitleUpdated = (event) => {
      if (event.title && event.title !== 'about:blank') {
        setTitle(event.title)
      }
    }

    const persistCurrentUrl = (url) => {
      if (!url || currentUrlRef.current === url) return

      currentUrlRef.current = url
      setCurrentUrl(url)
      callbacksRef.current.onUrlChange?.(id, url)
    }

    const onDidNavigate = (event) => {
      if (event.url) {
        console.info('[branch-debug]', { event: 'chat-node-did-navigate', nodeId: id, url: event.url })
        persistCurrentUrl(event.url)
        trackEvent('webview_navigated', {
          node_id: id,
          destination_url: event.url
        })
      }
    }

    const onDidNavigateInPage = (event) => {
      const url = event.url || webview.getURL?.()
      console.info('[branch-debug]', { event: 'chat-node-did-navigate-in-page', nodeId: id, url })
      persistCurrentUrl(url)
    }

    // Direct interception of new-window requests from the webview.
    // This fires in the renderer (no IPC needed) when the guest page
    // tries to open a new tab/window (e.g. ChatGPT "Branch in new chat").
    const onNewWindow = (event) => {
      const url = event.url
      console.info('[branch-debug]', { event: 'chat-node-new-window', nodeId: id, url })
      if (url && callbacksRef.current.onBranch) {
        trackEvent('branch_requested', {
          node_id: id,
          target_url: url
        })
        callbacksRef.current.onBranch(url, id)
      }
    }

    webview.addEventListener('dom-ready', onDomReady)
    webview.addEventListener('page-title-updated', onPageTitleUpdated)
    webview.addEventListener('did-navigate', onDidNavigate)
    webview.addEventListener('did-navigate-in-page', onDidNavigateInPage)
    webview.addEventListener('new-window', onNewWindow)

    return () => {
      try {
        persistCurrentUrl(webview.getURL?.())
      } catch {}
      webview.removeEventListener('dom-ready', onDomReady)
      webview.removeEventListener('page-title-updated', onPageTitleUpdated)
      webview.removeEventListener('did-navigate', onDidNavigate)
      webview.removeEventListener('did-navigate-in-page', onDidNavigateInPage)
      webview.removeEventListener('new-window', onNewWindow)

      if (callbacksRef.current.unregisterWebview) {
        callbacksRef.current.unregisterWebview(id)
      }
    }
  }, [id])

  const handleBack = () => {
    if (data.nativeViewId) return
    if (webviewRef.current?.canGoBack()) webviewRef.current.goBack()
  }

  const handleForward = () => {
    if (data.nativeViewId) return
    if (webviewRef.current?.canGoForward()) webviewRef.current.goForward()
  }

  const handleReload = () => {
    if (data.nativeViewId) return
    webviewRef.current?.reload()
  }

  const handleCloseNode = () => {
    window.electronAPI?.closeBranchView?.(data.nativeViewId)
    callbacksRef.current.onClose?.(id)
  }

  return (
    <div className="chat-node">
      <NodeResizer
        isVisible={selected}
        minWidth={360}
        minHeight={420}
        lineClassName="chat-node-resize-line"
        handleClassName="chat-node-resize-handle"
        onResizeStart={data.onResizeStart}
        onResizeEnd={data.onResizeEnd}
      />
      <Handle type="target" position={Position.Left} className="chat-handle" />

      {/* Header - this is the drag handle */}
      <div className="chat-node-header">
        <div className="chat-node-nav">
          <button className="nav-btn" onClick={handleBack} title="Back">
            &#8592;
          </button>
          <button className="nav-btn" onClick={handleForward} title="Forward">
            &#8594;
          </button>
          <button className="nav-btn" onClick={handleReload} title="Reload">
            &#8635;
          </button>
        </div>
        <span className="chat-node-title" title={title}>
          {title}
        </span>
        {isLoading && <span className="chat-node-loading">Loading...</span>}
        <button
          className="close-btn"
          onClick={handleCloseNode}
          title="Close node"
        >
          &#215;
        </button>
      </div>

      {/* URL bar */}
      <div className="chat-node-urlbar">
        <span className="chat-node-url">{currentUrl}</span>
      </div>

      {/* Webview body */}
      <div className="chat-node-body">
        {data.nativeViewId ? (
          <div ref={nativeHostRef} className="native-branch-host" />
        ) : (
          <webview
            ref={webviewRef}
            src={data.url}
            partition="persist:chatgpt"
            className="chat-webview"
            allowpopups="true"
          />
        )}
        {isLoading && !data.nativeViewId && (
          <div className="chat-node-loading-overlay">
            <div className="loading-spinner" />
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="chat-handle" />
    </div>
  )
}

export default ChatNode
