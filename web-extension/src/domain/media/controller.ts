import type { MediaCapabilities, MediaId, MediaSnapshot } from './model'

/**
 * DOM-free control boundary. Page-main adapters own the underlying media object;
 * domain and application code see only this port and serializable snapshots.
 */
export interface MediaController {
  readonly mediaId: MediaId
  readonly capabilities: MediaCapabilities
  getSnapshot(): MediaSnapshot
  play(): Promise<void>
  pause(): Promise<void>
  seekTo(seconds: number): Promise<void>
  setPlaybackRate(value: number): Promise<void>
  setVolume(value: number): Promise<void>
  setMuted(value: boolean): Promise<void>
}

export interface MediaControllerResolver {
  resolve(mediaId: MediaId): MediaController | undefined
}
