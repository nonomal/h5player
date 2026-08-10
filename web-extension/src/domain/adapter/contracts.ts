import type { MediaController, MediaId, MediaSnapshot } from '../media'

export type { MediaController } from '../media'

export type AdapterTeardown = () => void

export type MediaControllerChangeReason = 'interaction' | 'state'

export interface MediaControllerChange {
  readonly snapshot: MediaSnapshot
  readonly reason: MediaControllerChangeReason
  readonly observedAt: number
}

export type MediaControllerListener = (change: MediaControllerChange) => void

export interface ObservableMediaController extends MediaController {
  subscribe(listener: MediaControllerListener): AdapterTeardown
  teardown(): void
}

export interface MediaControllerContext {
  readonly mediaId: MediaId
  readonly frameId: number
  readonly now: () => number
  readonly schedule?: (callback: () => void) => void
}

export interface MediaAdapter<TTarget = unknown> {
  readonly id: string
  readonly priority: number

  supports(target: unknown): target is TTarget
  createController(target: TTarget, context: MediaControllerContext): ObservableMediaController
}
