export interface WindowLifetimeDeps {
  // Whether an agent is running.
  busy: () => boolean;
  // Asks the user whether to quit while an agent runs. Resolves true to quit.
  confirmQuit: () => boolean;
  // Whether closing the window leaves the app running.
  keepRunning: () => boolean;
}

// Decides what closing the window and quitting do. Closing hides the window, so agents keep
// running, unless the user turned that off. Then it asks the app to quit.
export class WindowLifetime {
  private quitting = false;

  constructor(private readonly deps: WindowLifetimeDeps) {}

  // What closing the window does. 'close' lets it close, because the app is already quitting.
  get closeAction(): 'close' | 'hide' | 'quit' {
    if (this.quitting) return 'close';
    return this.deps.keepRunning() ? 'hide' : 'quit';
  }

  // Whether a quit the user asked for goes ahead. Warns once per attempt while an agent runs.
  requestQuit(): boolean {
    if (!this.quitting && this.deps.busy() && !this.deps.confirmQuit()) return false;
    this.quitting = true;
    return true;
  }

  // For a quit that was already confirmed, or that the system won't let the app refuse.
  forceQuit(): void {
    this.quitting = true;
  }
}
