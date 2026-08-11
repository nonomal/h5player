import axe from 'axe-core'
import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { OptionsApplication } from '../../src/application/ui'
import OptionsApp from '../../src/ui/options/OptionsApp.vue'
import { createOptionsRouter } from '../../src/ui/options/router'
import { FakeRuntimeApi } from '../test-support/fake-runtime-api'
import { FakeActiveTabPort, FakeSettingsChangeSourcePort } from '../test-support/fakes'

async function renderOptions() {
  const api = new FakeRuntimeApi()
  const changes = new FakeSettingsChangeSourcePort()
  const application = new OptionsApplication(api, new FakeActiveTabPort(), changes)
  const router = createOptionsRouter()
  await router.push('/general')
  const rendered = render(OptionsApp, {
    props: { application },
    global: { plugins: [router] }
  })
  await router.isReady()
  await screen.findByRole('heading', { name: '基本设置' })
  return { api, changes, router, ...rendered }
}

describe('OptionsApp', () => {
  it('renders the settings shell, navigates by keyboard-accessible links, and passes axe', async () => {
    const { container } = await renderOptions()
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeTruthy()

    await fireEvent.click(screen.getByRole('link', { name: /快捷键/ }))
    expect(await screen.findByRole('heading', { name: '快捷键' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /录制快捷键/ }).length).toBeGreaterThan(5)

    const result = await axe.run(container)
    expect(result.violations).toEqual([])
  })

  it('reloads the visible snapshot when storage change events arrive', async () => {
    const { api, changes } = await renderOptions()
    const before = api.getSettingsCalls
    api.settings = { ...api.settings, revision: 9 }
    changes.emit()

    expect(await screen.findByText('已保存到修订 9')).toBeTruthy()
    expect(api.getSettingsCalls).toBeGreaterThan(before)
  })

  it('previews and confirms a schema-valid import before replacing settings', async () => {
    const { api, container } = await renderOptions()
    await fireEvent.click(screen.getByRole('link', { name: /数据管理/ }))
    await screen.findByRole('heading', { name: '数据管理' })

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input missing')
    const content = await api.exportSettings()
    await fireEvent.change(input, {
      target: {
        files: [new File([content], 'settings.json', { type: 'application/json' })]
      }
    })

    expect(await screen.findByText('导入预览')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '确认导入并备份当前配置' }))
    const dialog = await screen.findByRole('dialog')
    await fireEvent.click(within(dialog).getByRole('button', { name: '导入' }))
    expect(await screen.findByText('导入前备份')).toBeTruthy()
  })
})
