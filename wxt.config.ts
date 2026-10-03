import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'PayAttention',
    description:
      'Pause media when you leave a tab so you stay focused on what you are watching or listening to.',
    permissions: ['storage', 'tabs'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'PayAttention',
    },
    commands: {
      'toggle-current-tab-exception': {
        suggested_key: {
          default: 'Alt+Shift+A',
        },
        description: 'Allow or disallow the current tab until it closes',
      },
      'toggle-payattention': {
        suggested_key: {
          default: 'Alt+Shift+P',
        },
        description: 'Enable or disable PayAttention',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'payattention@local.invalid',
              strict_min_version: '128.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
