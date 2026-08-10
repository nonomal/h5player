import * as z from 'zod/mini'
import {
  type MediaController,
  mediaIdSchema,
  mediaSnapshotSchema,
  type MediaCapabilities,
  type MediaId,
  type MediaSnapshot
} from '../media'
import type { Result } from '../../shared/result'

const finiteNumberSchema = z.number()
export const playCommandSchema = z.strictObject({
  type: z.literal('media.play'),
  mediaId: mediaIdSchema
})
export const pauseCommandSchema = z.strictObject({
  type: z.literal('media.pause'),
  mediaId: mediaIdSchema
})
export const seekCommandSchema = z.strictObject({
  type: z.literal('media.seek'),
  mediaId: mediaIdSchema,
  deltaSeconds: finiteNumberSchema
})
export const setRateCommandSchema = z.strictObject({
  type: z.literal('media.set-rate'),
  mediaId: mediaIdSchema,
  value: finiteNumberSchema
})
export const adjustRateCommandSchema = z.strictObject({
  type: z.literal('media.adjust-rate'),
  mediaId: mediaIdSchema,
  delta: finiteNumberSchema
})
export const setVolumeCommandSchema = z.strictObject({
  type: z.literal('media.set-volume'),
  mediaId: mediaIdSchema,
  value: finiteNumberSchema
})
export const adjustVolumeCommandSchema = z.strictObject({
  type: z.literal('media.adjust-volume'),
  mediaId: mediaIdSchema,
  delta: finiteNumberSchema
})
export const setMutedCommandSchema = z.strictObject({
  type: z.literal('media.set-muted'),
  mediaId: mediaIdSchema,
  value: z.boolean()
})
export const toggleMuteCommandSchema = z.strictObject({
  type: z.literal('media.toggle-mute'),
  mediaId: mediaIdSchema
})

export const mediaCommandSchema = z.union([
  playCommandSchema,
  pauseCommandSchema,
  seekCommandSchema,
  setRateCommandSchema,
  adjustRateCommandSchema,
  setVolumeCommandSchema,
  adjustVolumeCommandSchema,
  setMutedCommandSchema,
  toggleMuteCommandSchema
])

export const MEDIA_COMMAND_TYPES = [
  'media.play',
  'media.pause',
  'media.seek',
  'media.set-rate',
  'media.adjust-rate',
  'media.set-volume',
  'media.adjust-volume',
  'media.set-muted',
  'media.toggle-mute'
] as const

export const mediaCommandTypeSchema = z.enum(MEDIA_COMMAND_TYPES)

export type PlayCommand = z.infer<typeof playCommandSchema>
export type PauseCommand = z.infer<typeof pauseCommandSchema>
export type SeekCommand = z.infer<typeof seekCommandSchema>
export type SetRateCommand = z.infer<typeof setRateCommandSchema>
export type AdjustRateCommand = z.infer<typeof adjustRateCommandSchema>
export type SetVolumeCommand = z.infer<typeof setVolumeCommandSchema>
export type AdjustVolumeCommand = z.infer<typeof adjustVolumeCommandSchema>
export type SetMutedCommand = z.infer<typeof setMutedCommandSchema>
export type ToggleMuteCommand = z.infer<typeof toggleMuteCommandSchema>
export type MediaCommand = z.infer<typeof mediaCommandSchema>
export type MediaCommandType = MediaCommand['type']

export type CommandForType<T extends MediaCommandType> = Extract<MediaCommand, { type: T }>

export type CommandDiagnosticValue = string | number | boolean | null
export type CommandDiagnosticContext = Readonly<Record<string, CommandDiagnosticValue>>

export type CommandErrorCode =
  | 'INVALID_COMMAND'
  | 'COMMAND_NOT_REGISTERED'
  | 'COMMAND_ALREADY_REGISTERED'
  | 'INVALID_COMMAND_HANDLER'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_UNAVAILABLE'
  | 'INVALID_MEDIA_SNAPSHOT'
  | 'CAPABILITY_UNAVAILABLE'
  | 'INVALID_COMMAND_RESULT'
  | 'COMMAND_EXECUTION_FAILED'

export type CommandErrorMessageKey =
  | 'command.error.invalidInput'
  | 'command.error.notRegistered'
  | 'command.error.alreadyRegistered'
  | 'command.error.invalidHandler'
  | 'command.error.mediaNotFound'
  | 'command.error.mediaUnavailable'
  | 'command.error.invalidMediaSnapshot'
  | 'command.error.capabilityUnavailable'
  | 'command.error.invalidResult'
  | 'command.error.executionFailed'

export interface CommandError {
  readonly code: CommandErrorCode
  readonly messageKey: CommandErrorMessageKey
  readonly context?: CommandDiagnosticContext
}

export interface CommandSuccess {
  readonly commandType: MediaCommandType
  readonly mediaId: MediaId
  readonly changed: boolean
  readonly snapshot: MediaSnapshot
}

export type CommandResult = Result<CommandSuccess, CommandError>
export type CommandSuccessResult = { readonly ok: true; readonly value: CommandSuccess }

export interface ResolvedCommandContext {
  readonly controller: MediaController
  readonly snapshot: MediaSnapshot
}

export interface CommandHandler<C extends MediaCommand = MediaCommand> {
  readonly type: C['type']
  readonly requiredCapability?: keyof MediaCapabilities
  execute(command: C, context: ResolvedCommandContext): Promise<CommandResult>
}

export const commandSuccessSchema = z.strictObject({
  commandType: mediaCommandTypeSchema,
  mediaId: mediaIdSchema,
  changed: z.boolean(),
  snapshot: mediaSnapshotSchema
})

const diagnosticValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const diagnosticContextSchema = z
  .record(z.string().check(z.minLength(1), z.maxLength(64)), diagnosticValueSchema)
  .check(z.refine((value) => Object.keys(value).length <= 16))

export const commandErrorSchema = z.strictObject({
  code: z.enum([
    'INVALID_COMMAND',
    'COMMAND_NOT_REGISTERED',
    'COMMAND_ALREADY_REGISTERED',
    'INVALID_COMMAND_HANDLER',
    'MEDIA_NOT_FOUND',
    'MEDIA_UNAVAILABLE',
    'INVALID_MEDIA_SNAPSHOT',
    'CAPABILITY_UNAVAILABLE',
    'INVALID_COMMAND_RESULT',
    'COMMAND_EXECUTION_FAILED'
  ]),
  messageKey: z.enum([
    'command.error.invalidInput',
    'command.error.notRegistered',
    'command.error.alreadyRegistered',
    'command.error.invalidHandler',
    'command.error.mediaNotFound',
    'command.error.mediaUnavailable',
    'command.error.invalidMediaSnapshot',
    'command.error.capabilityUnavailable',
    'command.error.invalidResult',
    'command.error.executionFailed'
  ]),
  context: z.optional(diagnosticContextSchema)
})

export const commandResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), value: commandSuccessSchema }),
  z.strictObject({ ok: z.literal(false), error: commandErrorSchema })
])

export function commandSuccess(
  command: MediaCommand,
  snapshot: MediaSnapshot,
  changed: boolean
): CommandSuccessResult {
  return {
    ok: true,
    value: {
      commandType: command.type,
      mediaId: command.mediaId,
      changed,
      snapshot
    }
  }
}
