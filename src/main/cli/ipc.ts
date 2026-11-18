import { ui } from '../ui-language'
import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { LOCAL_CLIS, type LocalCliId, type LocalCliLaunch, type LocalCliList } from '../../shared/local-cli'
import { findWindowsCli, launchWindowsCli } from './windows-cli'

function isCliId(id: unknown): id is LocalCliId {
  return LOCAL_CLIS.some((cli) => cli.id === id)
}

export function registerCliIpc(getWindow: () => BrowserWindow | null): void {
  const isMainFrame = (event: IpcMainInvokeEvent): boolean =>
    event.sender === getWindow()?.webContents && event.senderFrame === event.sender.mainFrame

  ipcMain.handle('cli:list', async (event): Promise<LocalCliList> => {
    if (process.platform !== 'win32' || !isMainFrame(event)) return { supported: false }
    const clients = await Promise.all(
      LOCAL_CLIS.map(async ({ id }) => ({ id, installed: Boolean(await findWindowsCli(id)) }))
    )
    return { supported: true, clients }
  })

  ipcMain.handle('cli:launch', async (event, id: unknown): Promise<LocalCliLaunch> => {
    if (process.platform !== 'win32' || !isMainFrame(event) || !isCliId(id)) {
      return { ok: false, error: ui('Este terminal no está disponible.', 'This terminal is unavailable.') }
    }

    const binary = await findWindowsCli(id)
    if (!binary)
      return {
        ok: false,
        error: ui('Instala la versión nativa del CLI y vuelve a comprobar.', 'Install the native CLI and check again.')
      }

    try {
      const directory = await mkdtemp(join(app.getPath('temp'), `OpenRoute-${id}-`))
      await launchWindowsCli(binary, directory)
      return { ok: true }
    } catch {
      return {
        ok: false,
        error: ui(
          'No se pudo abrir el CLI. Comprueba que se abre desde el terminal de Windows.',
          'Could not open the CLI. Check that it starts in Windows Terminal.'
        )
      }
    }
  })
}
