import type { MediaCommand } from '../../domain/command'
import {
  getHotkeyCommandDefinition,
  HotkeyInterpreter,
  type HotkeyEventInput
} from '../../domain/hotkey'
import type { GlobalSettings } from '../../domain/settings'
import type { MediaCommandResultResponse, MediaPageState } from '../media'
import type { Teardown } from '../ports/browser'

export type HotkeyRuntimeEvent = HotkeyEventInput &
  Readonly<{
    editableTarget: boolean
    playerFocused: boolean
    preventDefault(): void
    stopPropagation(): void
  }>

export interface HotkeyEventSourcePort {
  subscribe(listener: (event: HotkeyRuntimeEvent) => void): Teardown
}

export interface HotkeyMediaPort {
  getState(): Promise<MediaPageState>
  execute(command: MediaCommand): Promise<MediaCommandResultResponse>
}

export class HotkeyController {
  private settings: GlobalSettings
  private unsubscribe: Teardown | null = null
  private executionTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly source: HotkeyEventSourcePort,
    private readonly media: HotkeyMediaPort,
    initialSettings: GlobalSettings,
    private readonly onError: (error: unknown) => void = () => undefined,
    private readonly interpreter = new HotkeyInterpreter()
  ) {
    this.settings = initialSettings
  }

  start(): Teardown {
    if (!this.unsubscribe) this.unsubscribe = this.source.subscribe(this.handleEvent)
    return () => this.stop()
  }

  update(settings: GlobalSettings): void {
    this.settings = settings
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private readonly handleEvent = (event: HotkeyRuntimeEvent): void => {
    const decision = this.interpreter.decide(event, {
      enabled: this.settings.enabled && this.settings.hotkeys.enabled,
      scope: this.settings.hotkeys.scope,
      bindings: this.settings.hotkeys.bindings,
      editableTarget: event.editableTarget,
      playerFocused: event.playerFocused
    })
    if (!decision.matched) return

    event.preventDefault()
    event.stopPropagation()
    this.executionTail = this.executionTail
      .then(async () => {
        const state = await this.media.getState()
        if (!state.activeMediaId) return
        const snapshot = state.media.find((item) => item.id === state.activeMediaId)
        if (!snapshot) return
        const command = getHotkeyCommandDefinition(decision.binding.commandId).createCommand(
          snapshot
        )
        await this.media.execute(command)
      })
      .catch((error: unknown) => this.onError(error))
  }
}
