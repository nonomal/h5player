import { genericAdapter } from '../../adapters/generic'
import { createMediaCommandRegistry } from '../../application/commands'
import {
  mediaCommandResultResponseSchema,
  mediaPageStateSchema,
  mediaPageStateSummarySchema,
  type MediaCommandResultResponse,
  type MediaPageState,
  type MediaPageStateSummary
} from '../../application/media'
import type { MediaCommand } from '../../domain/command'
import { createDomMediaDiscoveryService, type MediaDiscoveryUpdate } from '../../infrastructure/dom'
import { installOpenShadowRootHook } from './shadow-root-hook'

export class MediaPageRuntime {
  private readonly discovery
  private readonly commands
  private latestUpdate: MediaDiscoveryUpdate
  private readonly teardownDiscoverySubscription: () => void
  private readonly teardownShadowHook: () => void
  private readonly stateListeners = new Set<(summary: MediaPageStateSummary) => void>()
  private disposed = false

  constructor(
    private readonly currentWindow: Window,
    private readonly currentDocument: Document,
    private readonly frameId: number,
    private readonly now: () => number = Date.now
  ) {
    this.discovery = createDomMediaDiscoveryService({
      root: currentDocument,
      adapter: genericAdapter,
      frameId,
      now
    })
    this.latestUpdate = {
      revision: 0,
      current: Object.freeze([]),
      active: null,
      added: Object.freeze([]),
      updated: Object.freeze([]),
      removed: Object.freeze([])
    }
    this.teardownDiscoverySubscription = this.discovery.subscribe((update) => {
      this.latestUpdate = update
      this.notifyStateChanged()
    })
    this.commands = createMediaCommandRegistry(this.discovery)
    this.teardownShadowHook = installOpenShadowRootHook(currentWindow, () => {
      this.discovery.refresh()
    })
    currentWindow.addEventListener('pageshow', this.handlePageContextChange, true)
    currentWindow.addEventListener('popstate', this.handlePageContextChange, true)
    currentWindow.addEventListener('hashchange', this.handlePageContextChange, true)
  }

  getState(): MediaPageState {
    this.assertActive()
    const state = {
      frameId: this.frameId,
      revision: this.latestUpdate.revision,
      activeMediaId: this.latestUpdate.active?.id ?? null,
      media: [...this.latestUpdate.current],
      observedAt: Math.max(0, this.now())
    }
    return mediaPageStateSchema.parse(state)
  }

  getStateSummary(): MediaPageStateSummary {
    this.assertActive()
    return mediaPageStateSummarySchema.parse({
      frameId: this.frameId,
      revision: this.latestUpdate.revision,
      activeMediaId: this.latestUpdate.active?.id ?? null,
      mediaCount: this.latestUpdate.current.length,
      observedAt: Math.max(0, this.now())
    })
  }

  subscribeStateChanged(listener: (summary: MediaPageStateSummary) => void): () => void {
    this.assertActive()
    this.stateListeners.add(listener)
    this.notifyListener(listener)
    return () => this.stateListeners.delete(listener)
  }

  async execute(command: MediaCommand): Promise<MediaCommandResultResponse> {
    this.assertActive()
    const result = await this.commands.execute(command)
    this.discovery.refresh()
    return mediaCommandResultResponseSchema.parse({ result, state: this.getState() })
  }

  refresh(): void {
    if (!this.disposed) this.discovery.refresh()
  }

  teardown(): void {
    if (this.disposed) return
    this.disposed = true
    this.currentWindow.removeEventListener('pageshow', this.handlePageContextChange, true)
    this.currentWindow.removeEventListener('popstate', this.handlePageContextChange, true)
    this.currentWindow.removeEventListener('hashchange', this.handlePageContextChange, true)
    this.teardownShadowHook()
    this.teardownDiscoverySubscription()
    this.discovery.teardown()
    this.stateListeners.clear()
  }

  private readonly handlePageContextChange: EventListener = () => {
    this.refresh()
  }

  private notifyStateChanged(): void {
    if (this.disposed || this.stateListeners.size === 0) return
    for (const listener of [...this.stateListeners]) this.notifyListener(listener)
  }

  private notifyListener(listener: (summary: MediaPageStateSummary) => void): void {
    try {
      listener(this.getStateSummary())
    } catch {
      // State observers are isolated from the media discovery lifecycle.
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Media page runtime is disposed')
  }
}
