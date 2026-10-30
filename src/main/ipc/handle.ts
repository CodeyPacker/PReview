import { ipcMain } from 'electron';
import {
  ipcContract,
  type IpcChannel,
  type IpcInput,
  type IpcOutput,
} from '../../shared/contracts/ipc.ts';
import { log } from '../logging/log.ts';
import { isTrustedRendererUrl } from '../security/trusted-sender.ts';

type Handler<C extends IpcChannel> = (input: IpcInput<C>) => IpcOutput<C> | Promise<IpcOutput<C>>;

// Registers a handler for one contract channel. Rejects calls from any page other than
// the app's own renderer, validates the input before the handler runs, and validates
// the output before it crosses back to the renderer.
export function handle<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  const { input, output } = ipcContract[channel];

  ipcMain.handle(channel, async (event, raw: unknown) => {
    const senderUrl = event.senderFrame?.url ?? '';
    if (!isTrustedRendererUrl(senderUrl)) {
      log.warn(`IPC ${channel} rejected: untrusted sender`, senderUrl);
      throw new Error(`${channel}: untrusted sender`);
    }

    const parsed = input.safeParse(raw);
    if (!parsed.success) {
      log.warn(`IPC ${channel} rejected: invalid input`, parsed.error.issues);
      throw new Error(`${channel}: invalid input`);
    }

    try {
      return output.parse(await handler(parsed.data as IpcInput<C>));
    } catch (error) {
      log.error(`IPC ${channel} failed`, error);
      throw error;
    }
  });
}
