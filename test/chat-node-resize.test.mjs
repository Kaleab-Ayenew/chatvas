import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const chatNodeSource = await readFile(
  new URL('../src/renderer/src/components/ChatNode.jsx', import.meta.url),
  'utf8'
)
const appSource = await readFile(new URL('../src/renderer/src/App.jsx', import.meta.url), 'utf8')
const chatNodeCss = await readFile(
  new URL('../src/renderer/src/components/ChatNode.css', import.meta.url),
  'utf8'
)

test('chat nodes expose React Flow resize controls', () => {
  assert.match(chatNodeSource, /import\s*\{[^}]*NodeResizer[^}]*\}\s*from\s*['"]@xyflow\/react['"]/)
  assert.match(chatNodeSource, /<NodeResizer\b/)
  assert.match(chatNodeSource, /minWidth=\{360\}/)
  assert.match(chatNodeSource, /minHeight=\{420\}/)
})

test('new chat nodes start with default dimensions managed by React Flow', () => {
  const defaultSizeDefinition = /const\s+defaultNodeSize\s*=\s*\{\s*width:\s*620,\s*height:\s*750\s*\}/s
  assert.match(appSource, defaultSizeDefinition)

  const styledNodes = appSource.match(/style:\s*defaultNodeSize/g) || []
  assert.equal(styledNodes.length, 3)

  assert.doesNotMatch(chatNodeCss, /\.chat-node\s*\{[^}]*\bwidth:\s*620px/s)
  assert.doesNotMatch(chatNodeCss, /\.chat-node\s*\{[^}]*\bheight:\s*750px/s)
})
