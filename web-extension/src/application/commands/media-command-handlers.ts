import { clampMediaTime, clampPlaybackRate, clampUnit, roundMediaValue } from '../../domain/media'
import {
  commandSuccess,
  type AdjustRateCommand,
  type AdjustVolumeCommand,
  type CommandHandler,
  type MediaCommand,
  type PauseCommand,
  type PlayCommand,
  type ResolvedCommandContext,
  type SeekCommand,
  type SetMutedCommand,
  type SetRateCommand,
  type SetVolumeCommand,
  type ToggleMuteCommand
} from '../../domain/command'

function changedResult(command: MediaCommand, context: ResolvedCommandContext) {
  return commandSuccess(command, context.controller.getSnapshot(), true)
}

function mediaValuesEqual(left: number, right: number): boolean {
  return roundMediaValue(left) === roundMediaValue(right)
}

function legacySeekTarget(
  currentTime: number,
  deltaSeconds: number,
  duration: number | null
): number {
  const relative = currentTime + deltaSeconds
  const legacyAdjusted = deltaSeconds < 0 && relative < 1 ? 0 : relative
  return clampMediaTime(roundMediaValue(legacyAdjusted, 1), duration)
}

async function applyVolume(
  command: SetVolumeCommand | AdjustVolumeCommand,
  context: ResolvedCommandContext,
  target: number
) {
  const volumeChanged = !mediaValuesEqual(target, context.snapshot.metrics.volume)
  const shouldUnmute = context.snapshot.metrics.muted && context.snapshot.capabilities.mute
  if (!volumeChanged && !shouldUnmute) {
    return commandSuccess(command, context.snapshot, false)
  }
  if (volumeChanged) await context.controller.setVolume(target)
  if (shouldUnmute) await context.controller.setMuted(false)
  return changedResult(command, context)
}

export const playCommandHandler: CommandHandler<PlayCommand> = {
  type: 'media.play',
  requiredCapability: 'playback',
  async execute(command, context) {
    if (context.snapshot.state === 'active') {
      return commandSuccess(command, context.snapshot, false)
    }
    await context.controller.play()
    return changedResult(command, context)
  }
}

export const pauseCommandHandler: CommandHandler<PauseCommand> = {
  type: 'media.pause',
  requiredCapability: 'playback',
  async execute(command, context) {
    if (context.snapshot.state === 'paused') {
      return commandSuccess(command, context.snapshot, false)
    }
    await context.controller.pause()
    return changedResult(command, context)
  }
}

export const seekCommandHandler: CommandHandler<SeekCommand> = {
  type: 'media.seek',
  requiredCapability: 'seek',
  async execute(command, context) {
    if (command.deltaSeconds === 0) {
      return commandSuccess(command, context.snapshot, false)
    }
    const target = legacySeekTarget(
      context.snapshot.metrics.currentTime,
      command.deltaSeconds,
      context.snapshot.metrics.duration
    )
    if (mediaValuesEqual(target, context.snapshot.metrics.currentTime)) {
      return commandSuccess(command, context.snapshot, false)
    }
    await context.controller.seekTo(target)
    return changedResult(command, context)
  }
}

export const setRateCommandHandler: CommandHandler<SetRateCommand> = {
  type: 'media.set-rate',
  requiredCapability: 'playbackRate',
  async execute(command, context) {
    const target = roundMediaValue(clampPlaybackRate(command.value), 1)
    if (mediaValuesEqual(target, context.snapshot.metrics.playbackRate)) {
      return commandSuccess(command, context.snapshot, false)
    }
    await context.controller.setPlaybackRate(target)
    return changedResult(command, context)
  }
}

export const adjustRateCommandHandler: CommandHandler<AdjustRateCommand> = {
  type: 'media.adjust-rate',
  requiredCapability: 'playbackRate',
  async execute(command, context) {
    if (command.delta === 0) {
      return commandSuccess(command, context.snapshot, false)
    }
    const target = roundMediaValue(
      clampPlaybackRate(context.snapshot.metrics.playbackRate + command.delta),
      1
    )
    if (mediaValuesEqual(target, context.snapshot.metrics.playbackRate)) {
      return commandSuccess(command, context.snapshot, false)
    }
    await context.controller.setPlaybackRate(target)
    return changedResult(command, context)
  }
}

export const setVolumeCommandHandler: CommandHandler<SetVolumeCommand> = {
  type: 'media.set-volume',
  requiredCapability: 'volume',
  async execute(command, context) {
    const target = roundMediaValue(clampUnit(command.value), 2)
    return applyVolume(command, context, target)
  }
}

export const adjustVolumeCommandHandler: CommandHandler<AdjustVolumeCommand> = {
  type: 'media.adjust-volume',
  requiredCapability: 'volume',
  async execute(command, context) {
    if (command.delta === 0) {
      return commandSuccess(command, context.snapshot, false)
    }
    const target = roundMediaValue(clampUnit(context.snapshot.metrics.volume + command.delta), 2)
    return applyVolume(command, context, target)
  }
}

export const setMutedCommandHandler: CommandHandler<SetMutedCommand> = {
  type: 'media.set-muted',
  requiredCapability: 'mute',
  async execute(command, context) {
    if (command.value === context.snapshot.metrics.muted) {
      return commandSuccess(command, context.snapshot, false)
    }
    await context.controller.setMuted(command.value)
    return changedResult(command, context)
  }
}

export const toggleMuteCommandHandler: CommandHandler<ToggleMuteCommand> = {
  type: 'media.toggle-mute',
  requiredCapability: 'mute',
  async execute(command, context) {
    await context.controller.setMuted(!context.snapshot.metrics.muted)
    return changedResult(command, context)
  }
}

export const MEDIA_COMMAND_HANDLERS: readonly CommandHandler[] = [
  playCommandHandler,
  pauseCommandHandler,
  seekCommandHandler,
  setRateCommandHandler,
  adjustRateCommandHandler,
  setVolumeCommandHandler,
  adjustVolumeCommandHandler,
  setMutedCommandHandler,
  toggleMuteCommandHandler
]
