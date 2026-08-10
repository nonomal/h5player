import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenericAdapter } from '../../src/adapters/generic'
import { DomMediaDiscoveryService, type MediaDiscoveryUpdate } from '../../src/infrastructure/dom'

const services: DomMediaDiscoveryService[] = []

function createService(): DomMediaDiscoveryService {
  const service = new DomMediaDiscoveryService({
    root: document,
    adapter: new GenericAdapter(),
    now: Date.now
  })
  services.push(service)
  return service
}

async function waitForCurrent(service: DomMediaDiscoveryService, count: number): Promise<void> {
  await vi.waitFor(() => expect(service.current()).toHaveLength(count))
}

afterEach(() => {
  for (const service of services.splice(0)) service.teardown()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('DOM media discovery lifecycle', () => {
  it('batches dynamic video/audio additions and emits serializable snapshots only', async () => {
    const service = createService()
    const updates: MediaDiscoveryUpdate[] = []
    service.subscribe((update) => updates.push(update))
    service.start()

    const video = document.createElement('video')
    video.setAttribute('width', '640')
    video.setAttribute('height', '360')
    const audio = document.createElement('audio')
    audio.setAttribute('width', '300')
    audio.setAttribute('height', '40')
    document.body.append(video, audio)

    await waitForCurrent(service, 2)
    const addition = updates.findLast((update) => update.added.length > 0)
    expect(addition?.added).toHaveLength(2)
    expect(addition?.current.map((snapshot) => snapshot.kind)).toEqual(['video', 'audio'])
    expect(JSON.stringify(addition?.current)).not.toContain('HTMLMediaElement')
    expect(service.active()?.id).toBe(service.current()[0]?.id)
  })

  it('discovers open shadow roots, removes their media, and reuses stable media ids', async () => {
    const service = createService()
    const updates: MediaDiscoveryUpdate[] = []
    service.subscribe((update) => updates.push(update))
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    document.body.append(host)
    service.start()
    expect(service.current()).toHaveLength(0)

    const video = document.createElement('video')
    video.setAttribute('width', '640')
    video.setAttribute('height', '360')
    shadow.append(video)

    await waitForCurrent(service, 1)
    const originalId = service.current()[0]?.id
    expect(originalId).toBeDefined()
    expect(service.controllerFor(originalId ?? '')).toBeDefined()
    expect(service.resolve(originalId ?? '')).toBe(service.controllerFor(originalId ?? ''))

    host.remove()
    await waitForCurrent(service, 0)
    expect(service.controllerFor(originalId ?? '')).toBeUndefined()
    expect(updates.findLast((update) => update.removed.length > 0)?.removed).toContain(originalId)

    document.body.append(host)
    await waitForCurrent(service, 1)
    expect(service.current()[0]?.id).toBe(originalId)
  })

  it('can explicitly refresh an open shadow root attached after its host', () => {
    const service = createService()
    const host = document.createElement('div')
    document.body.append(host)
    service.start()
    expect(service.current()).toHaveLength(0)

    const shadow = host.attachShadow({ mode: 'open' })
    const video = document.createElement('video')
    video.setAttribute('width', '320')
    video.setAttribute('height', '180')
    shadow.append(video)
    service.refresh()

    expect(service.current()).toHaveLength(1)
  })

  it('switches active media after a recent user interaction', async () => {
    const service = createService()
    service.start()
    const large = document.createElement('video')
    large.setAttribute('width', '1280')
    large.setAttribute('height', '720')
    const small = document.createElement('video')
    small.setAttribute('width', '320')
    small.setAttribute('height', '180')
    document.body.append(large, small)
    await waitForCurrent(service, 2)

    const largeId = service.current()[0]?.id
    const smallId = service.current()[1]?.id
    expect(service.active()?.id).toBe(largeId)

    small.dispatchEvent(new Event('pointerdown'))
    await vi.waitFor(() => expect(service.active()?.id).toBe(smallId))
  })

  it('tears down observers, controllers, listeners, and queued lifecycle work explicitly', async () => {
    const service = createService()
    const updates: MediaDiscoveryUpdate[] = []
    service.subscribe((update) => updates.push(update))
    service.start()
    const video = document.createElement('video')
    video.setAttribute('width', '640')
    video.setAttribute('height', '360')
    document.body.append(video)
    await waitForCurrent(service, 1)
    const updateCount = updates.length

    service.teardown()
    expect(service.current()).toEqual([])
    expect(service.active()).toBeNull()
    document.body.append(document.createElement('audio'))
    await Promise.resolve()
    await Promise.resolve()

    expect(updates).toHaveLength(updateCount)
    expect(service.current()).toEqual([])
  })
})
