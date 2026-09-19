import { defineEcConfig } from 'astro-expressive-code';
import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import ld from './src/plugins/grammar-ld.mjs';

/**
 * Shared presentation settings for Markdown code blocks.
 * The theme selectors follow the site's existing data-theme values.
 */
export default defineEcConfig({
  themes: ['github-light', 'aurora-x'],
  useDarkModeMediaQuery: false,
  themeCssSelector: (theme) => `[data-theme="${theme.type}"]`,
  plugins: [pluginLineNumbers(), pluginCollapsibleSections()],

  // Shiki ships no `ld` grammar, so register one for linker scripts.
  shiki: {
    langs: [ld],
  },

  frames: {
    extractFileNameFromCode: true,
    showCopyToClipboardButton: true,
    removeCommentsWhenCopyingTerminalFrames: true,
  },
  defaultProps: {
    wrap: false,
    showLineNumbers: true,
    collapseStyle: 'collapsible-auto',
  },
  styleOverrides: {
    uiFontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
    borderColor: 'var(--button-border-color)',
    frames: {
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabBorderColor: 'var(--button-border-color)',
      editorTabBarBorderBottomColor: 'var(--button-border-color)',
      tooltipSuccessBackground: 'var(--text-color)',
      tooltipSuccessForeground: 'var(--bg-color)',
    },
    lineNumbers: {
      foreground: 'var(--text-color-70)',
      highlightForeground: 'var(--text-color)',
    },
    collapsibleSections: {
      closedBackgroundColor: 'var(--button-hover-color)',
      closedBorderColor: 'var(--button-border-color)',
      closedTextColor: 'var(--text-color-70)',
    },
  },
});
