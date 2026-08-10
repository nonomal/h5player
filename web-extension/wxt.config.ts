import { defineConfig } from 'wxt'

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'H5Player Web Extension (Preview)',
    version: '0.1.0',
    description: 'H5Player 的独立 Manifest V3 Web Extension 预览版',
    permissions: ['storage'],
    optional_host_permissions: ['<all_urls>'],
    action: {
      default_title: 'H5Player'
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    },
    browser_specific_settings: {
      gecko: {
        id: 'h5player-webext@example.invalid',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none']
        }
      }
    }
  }
})
