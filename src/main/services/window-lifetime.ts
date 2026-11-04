export interface WindowLifetimeDeps {
  // Whether an agent is running.
  busy: () => boolean;
  // Asks the user whether to quit while an agent runs. Resolves true to quit.
  confirmQuit: () => boolean;
}

// Decides what closing the window and quitting do. Closing only hides the window, so agents keep
// running, until the app is really quitting.
export class WindowLifetime {
  private quitting = false;

  constructor(private readonly deps: WindowLifetimeDeps) {}

  get hideOnClose(): boolean {
    return !this.quitting;
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
