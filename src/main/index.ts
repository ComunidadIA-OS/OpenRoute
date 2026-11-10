import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import icon from '../../resources/icon.png?asset'
import { registerIpc } from './ipc'
import { store } from './store'

let win: BrowserWindow | null = null

// La interfaz se sirve con un protocolo propio (app://) en lugar de file://:
// así los workers del mapa funcionan y la CSP tiene un origen claro.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

function serveRenderer(): void {
  const root = normalize(join(__dirname, '../renderer'))
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    const file = normalize(join(root, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)))
    if (!file.startsWith(root + sep)) return new Response('No encontrado', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

const devUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 640,
    show: false,
    backgroundColor: '#070a09',
    title: 'OpenRoute',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform !== 'darwin'
      ? { titleBarOverlay: { color: '#070a09', symbolColor: '#a7b1ac', height: 40 } }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win?.show())

  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const own = url.startsWith('app://') || (devUrl !== undefined && url.startsWith(devUrl))
    if (!own) e.preventDefault()
  })

  if (devUrl) win.loadURL(devUrl)
  else win.loadURL('app://openroute/index.html')
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('es.openroute.app')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  serveRenderer()
  store.load()
  registerIpc(() => win)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => store.flush())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
