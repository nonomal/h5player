import { CommandRegistry } from '../../domain/command'
import type { MediaControllerResolver } from '../../domain/media'
import {
  MEDIA_COMMAND_HANDLERS,
  adjustRateCommandHandler,
  adjustVolumeCommandHandler,
  pauseCommandHandler,
  playCommandHandler,
  seekCommandHandler,
  setMutedCommandHandler,
  setRateCommandHandler,
  setVolumeCommandHandler,
  toggleMuteCommandHandler
} from './media-command-handlers'

export {
  MEDIA_COMMAND_HANDLERS,
  adjustRateCommandHandler,
  adjustVolumeCommandHandler,
  pauseCommandHandler,
  playCommandHandler,
  seekCommandHandler,
  setMutedCommandHandler,
  setRateCommandHandler,
  setVolumeCommandHandler,
  toggleMuteCommandHandler
}

export function createMediaCommandRegistry(controllers: MediaControllerResolver): CommandRegistry {
  return new CommandRegistry(controllers, MEDIA_COMMAND_HANDLERS)
}
