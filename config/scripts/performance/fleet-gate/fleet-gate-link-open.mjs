// Measurement only: times each stage of opening a link in a browser tab while main is periodically stalled.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = Number(process.env.LINK_OPEN_PORT || 9452)
const RUNS = Number(process.env.LINK_OPEN_RUNS || 8)
const STALLS = JSON.parse(process.env.LINK_OPEN_STALLS || '[[0,0],[500,1000],[1000,2000]]')
const WAVES = Number(process.env.LINK_OPEN_WAVES || 8)
const FAN = Number(process.env.LINK_OPEN_FAN || 10)
const LATENCY_MS = Number(process.env.LINK_OPEN_LATENCY_MS || 60)
const MARKER = 'data:text/html,orca-browser-attach-'

// Out of process so main's stalls never delay the page's responses.
const SERVER = `
const http = require('http')
const seen = new Map()
const page = (run) => '<!doctype html><title>link-open</title><script>(async()=>{for(let w=0;w<${WAVES};w++){await Promise.all(Array.from({length:${FAN}},(_,i)=>fetch("/r?run='+run+'&w="+w+"&i="+i).then(r=>r.text())))}await fetch("/done?run='+run+'")})()</script>'
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const run = u.searchParams.get('run')
  const send = (body, type) => setTimeout(() => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }, ${LATENCY_MS})
  if (u.pathname === '/page') { seen.set(run + ':page', Date.now()); return send(page(run), 'text/html') }
  if (u.pathname === '/r') return send('x'.repeat(2000), 'text/plain')
  if (u.pathname === '/done') { seen.set(run + ':done', Date.now()); return send('ok', 'text/plain') }
  if (u.pathname === '/result') { res.end(JSON.stringify({ page: seen.get(run + ':page') ?? null, done: seen.get(run + ':done') ?? null })); return }
  res.writeHead(404); res.end()
}).listen(${PORT}, '127.0.0.1', () => console.log('ready'))
`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-open-'))
  const file = path.join(dir, 'server.cjs')
  fs.writeFileSync(file, SERVER)
  const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve)
    child.once('exit', (code) => reject(new Error(`link-open server exited ${code}`)))
  })
  return () => {
    child.kill()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function serverResult(run) {
  const response = await fetch(`http://127.0.0.1:${PORT}/result?run=${run}`)
  return response.json()
}

function installMainRecorder({ app }) {
  if (globalThis.__linkOpen) {
    return
  }
  const state = { events: [], timer: null }
  globalThis.__linkOpen = state
  const note = (kind, url) => state.events.push({ kind, t: Date.now(), url })
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') {
      return
    }
    note('guestCreated', '')
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) {
        note('startNav', details.url)
      }
    })
    contents.on('did-finish-load', () => note('finishLoad', contents.getURL()))
  })
  globalThis.__linkOpenStall = (ms, period) => {
    clearTimeout(state.timer)
    state.timer = null
    if (!ms) {
      return
    }
    const cycle = () => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        // Busy main, like a synchronous stall.
      }
      state.timer = setTimeout(cycle, period - ms)
    }
    state.timer = setTimeout(cycle, Math.random() * period)
  }
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
}
function p90(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : null
}

export async function measureLinkOpen({ page, app }) {
  const stopServer = await startServer()
  const rows = []
  try {
    await app.evaluate(installMainRecorder)
    // Setup, not measured: a seeded workspace must be active for the tab to open in.
    const active = await page.evaluate(async () => {
      const state = window.__store.getState()
      if (!state.activeWorktreeId) {
        const first = Object.keys(state.tabsByWorktree ?? {})[0]
        if (first) {
          state.setActiveWorktree(first)
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      return window.__store.getState().activeWorktreeId
    })
    if (!active) {
      return { note: 'no workspace to open links in', undriven: 'no active workspace' }
    }
    for (const [stall, period] of STALLS) {
      for (let i = 0; i < RUNS; i += 1) {
        await app.evaluate((_electron, arg) => globalThis.__linkOpenStall(arg[0], arg[1]), [0, 0])
        await sleep(300)
        const run = `s${stall}-${i}-${Math.random().toString(36).slice(2, 8)}`
        const url = `http://127.0.0.1:${PORT}/page?run=${run}`
        await app.evaluate((_electron, arg) => {
          globalThis.__linkOpen.events = []
          globalThis.__linkOpenStall(arg[0], arg[1])
        }, [stall, period])
        const opened = await page.evaluate(
          ({ url, marker }) => {
            const marks = {}
            const seen = new Set(document.querySelectorAll('webview'))
            const scan = () => {
              for (const webview of document.querySelectorAll('webview')) {
                if (!seen.has(webview)) {
                  seen.add(webview)
                  marks.webview ??= Date.now()
                }
                const src = webview.getAttribute('src') ?? webview.src ?? ''
                if (!marks.marker && src.startsWith(marker)) {
                  marks.marker = Date.now()
                }
              }
            }
            const observer = new MutationObserver(scan)
            observer.observe(document, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ['src']
            })
            // The src property may not reflect to the attribute; a frame poll catches it too.
            const poll = () => {
              scan()
              if (!marks.marker) {
                requestAnimationFrame(poll)
              }
            }
            requestAnimationFrame(poll)
            window.__linkOpenRun = { marks, observer }
            const state = window.__store.getState()
            const worktreeId = state.activeWorktreeId
            marks.t0 = Date.now()
            const tab = state.createBrowserTab(worktreeId, url, { activate: true })
            marks.created = Date.now()
            return { tabId: tab.id }
          },
          { url, marker: MARKER }
        )
        let result = { page: null, done: null }
        const deadline = Date.now() + 60_000
        while (Date.now() < deadline) {
          result = await serverResult(run)
          if (result.done) {
            break
          }
          await sleep(50)
        }
        await app.evaluate((_electron, arg) => globalThis.__linkOpenStall(arg[0], arg[1]), [0, 0])
        const marks = await page.evaluate((tabId) => {
          const current = window.__linkOpenRun
          current.observer.disconnect()
          window.__store.getState().closeBrowserTab(tabId)
          return current.marks
        }, opened.tabId)
        const events = await app.evaluate(() => globalThis.__linkOpen.events)
        const first = (kind, match) =>
          events.find((event) => event.kind === kind && (!match || event.url.includes(match)))?.t
        const row = {
          stall,
          period,
          mount: marks.webview - marks.t0,
          prepare: marks.marker - marks.webview,
          guest: first('guestCreated') - marks.marker,
          navStart: first('startNav', run) - marks.marker,
          firstRequest: result.page - marks.marker,
          pageLoad: result.done - result.page,
          total: result.done - marks.t0
        }
        rows.push(row)
        console.log(`[linkopen] ${JSON.stringify(row)}`)
      }
    }
  } finally {
    await app
      .evaluate((_electron, arg) => globalThis.__linkOpenStall?.(arg[0], arg[1]), [0, 0])
      .catch(() => {})
    stopServer()
  }
  const keys = ['mount', 'prepare', 'guest', 'navStart', 'firstRequest', 'pageLoad', 'total']
  for (const [stall, period] of STALLS) {
    const group = rows.filter((row) => row.stall === stall && row.period === period)
    const summary = Object.fromEntries(
      keys.map((key) => [key, `${median(group.map((row) => row[key]))}/${p90(group.map((row) => row[key]))}`])
    )
    console.log(`[linkopen-summary] stall ${stall}/${period} p50/p90 ${JSON.stringify(summary)}`)
  }
  return { note: `${rows.length} link opens` }
}
