import { CommandRegistry } from '../../domain/command'
import type { MediaControllerResolver } from '../../domain/media'
import {
  MEDIA_COMMAND_HANDLERS,
  adjustRateCommandHandler,
  adjustVolumeCommandHandler,
  captureCommandHandler,
  panCommandHandler,
  pauseCommandHandler,
  playCommandHandler,
  resetVisualCommandHandler,
  rotateCommandHandler,
  seekCommandHandler,
  setFilterCommandHandler,
  setMutedCommandHandler,
  setRateCommandHandler,
  setVolumeCommandHandler,
  setZoomCommandHandler,
  toggleFlipCommandHandler,
  toggleFullscreenCommandHandler,
  toggleMuteCommandHandler,
  togglePictureInPictureCommandHandler
} from './media-command-handlers'

export {
  MEDIA_COMMAND_HANDLERS,
  adjustRateCommandHandler,
  adjustVolumeCommandHandler,
  captureCommandHandler,
  panCommandHandler,
  pauseCommandHandler,
  playCommandHandler,
  resetVisualCommandHandler,
  rotateCommandHandler,
  seekCommandHandler,
  setFilterCommandHandler,
  setMutedCommandHandler,
  setRateCommandHandler,
  setVolumeCommandHandler,
  setZoomCommandHandler,
  toggleFlipCommandHandler,
  toggleFullscreenCommandHandler,
  toggleMuteCommandHandler,
  togglePictureInPictureCommandHandler
}

export function createMediaCommandRegistry(controllers: MediaControllerResolver): CommandRegistry {
  return new CommandRegistry(controllers, MEDIA_COMMAND_HANDLERS)
}
