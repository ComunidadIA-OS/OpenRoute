import { ui } from '../ui-language'
import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cliSummary } from '../../core/cli-summary'
import { LOCAL_CLIS, type LocalCliId, type LocalCliLaunch, type LocalCliList } from '../../shared/local-cli'
import { store } from '../store'
import { findWindowsCli, launchWindowsCli, windowsCliSignedIn } from './windows-cli'

function isCliId(id: unknown): id is LocalCliId {
  return LOCAL_CLIS.some((cli) => cli.id === id)
}

export function registerCliIpc(getWindow: () => BrowserWindow | null): void {
  const isMainFrame = (event: IpcMainInvokeEvent): boolean =>
    event.sender === getWindow()?.webContents && event.senderFrame === event.sender.mainFrame

  ipcMain.handle('cli:list', async (event): Promise<LocalCliList> => {
    if (process.platform !== 'win32' || !isMainFrame(event)) return { supported: false }
    const clients = await Promise.all(
      LOCAL_CLIS.map(async ({ id }) => {
        const binary = await findWindowsCli(id)
        return binary
          ? { id, installed: true, signedIn: await windowsCliSignedIn(id, binary, app.getPath('temp')) }
          : { id, installed: false }
      })
    )
    return { supported: true, clients }
  })

  ipcMain.handle(
    'cli:launch',
    async (event, id: unknown, action: unknown = 'open', summary?: unknown): Promise<LocalCliLaunch> => {
      if (
        process.platform !== 'win32' ||
        !isMainFrame(event) ||
        !isCliId(id) ||
        (action !== 'open' && action !== 'sign-in')
      ) {
        return { ok: false, error: ui('Este terminal no está disponible.', 'This terminal is unavailable.') }
      }

      if (summary !== undefined) {
        const { sessions, activeId, settings } = store.state
        const session = sessions.find(({ id }) => id === activeId)
        if (
          action !== 'open' ||
          !session?.orders.length ||
          summary !== cliSummary(session.orders.length, session.plan, settings.language)
        ) {
          return {
            ok: false,
            error: ui(
              'El resumen cambió. Revísalo y vuelve a abrir el asistente.',
              'The summary changed. Review it and open the assistant again.'
            )
          }
        }
      }

      const binary = await findWindowsCli(id)
      if (!binary)
        return {
          ok: false,
          error: ui(
            'Instala la versión nativa del CLI y vuelve a comprobar.',
            'Install the native CLI and check again.'
          )
        }

      try {
        const directory = await mkdtemp(join(app.getPath('temp'), `OpenRoute-${id}-`))
        if (typeof summary === 'string') await writeFile(join(directory, 'resumen.txt'), summary, 'utf8')
        await launchWindowsCli(binary, directory, id, action, typeof summary === 'string')
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
    }
  )
}
