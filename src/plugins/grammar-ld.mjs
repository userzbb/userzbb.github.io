/**
 * TextMate grammar for GNU ld linker scripts (`.ld`).
 *
 * Shiki's `@shikijs/langs` bundle has no `ld` grammar, so code blocks tagged
 * `ld` fall back to plain text. This registration covers the constructs that
 * actually appear in linker scripts: output sections, the MEMORY/SECTIONS
 * blocks, built-in functions and symbols, address assignments and comments.
 *
 * Registered via `shiki.langs` in `ec.config.mjs`.
 */
export default {
  name: 'ld',
  scopeName: 'source.ld',
  fileTypes: ['ld', 'lds'],
  patterns: [
    { include: '#comments' },
    { include: '#keywords' },
    { include: '#functions' },
    { include: '#location-counter' },
    { include: '#sections' },
    { include: '#numbers' },
    { include: '#symbols' },
    { include: '#strings' },
  ],
  repository: {
    comments: {
      patterns: [
        { name: 'comment.block.ld', begin: '/\\*', end: '\\*/' },
        { name: 'comment.line.ld', match: '//.*$' },
      ],
    },

    // Top-level linker commands. `\b` keeps ENTRY from matching inside
    // identifiers such as `MY_ENTRY`.
    keywords: {
      patterns: [
        {
          name: 'keyword.control.ld',
          match:
            '\\b(ENTRY|SECTIONS|MEMORY|PHDRS|INCLUDE|GROUP|INPUT|OUTPUT|STARTUP|SEARCH_DIR|VERSION|ASSERT|OVERLAY|INSERT|FILL)\\b',
        },
        {
          name: 'keyword.other.ld',
          match:
            '\\b(ORIGIN|org|lENGTH|len|ALIGN|ALIGN_WITH_INPUT|SUBALIGN|KEEP|PROVIDE|PROVIDE_HIDDEN|HIDDEN|SORT|SORT_BY_NAME|SORT_BY_ALIGNMENT|SORT_BY_INIT_PRIORITY|SORT_NONE|NOLOAD|AT|LOADADDR|ADDR|SIZEOF|SEGMENT_START|DEFINED|ABSOLUTE|MAX|MIN|BLOCK|DATA_SEGMENT_ALIGN|DATA_SEGMENT_END)\\b',
        },
        {
          // Section type flags, only meaningful inside a MEMORY region list.
          name: 'storage.modifier.ld',
          match: '(?<=\\()[rwxail!]{1,6}(?=\\))',
        },
      ],
    },

    functions: {
      patterns: [
        { name: 'support.function.ld', match: '\\b[._a-zA-Z][\\w.]*(?=\\s*\\()' },
      ],
    },

    // The dot is the current location counter, both as a target
    // (`_etext = .;`) and inside expressions (`. = ALIGN(4);`).
    'location-counter': {
      patterns: [{ name: 'variable.language.ld', match: '(?:^|[^\\w.])\\.(?=\\s*[=;)])' }],
    },

    // Output section names: `.text :`, `.bss (NOLOAD) :`, `*(.text*)`.
    sections: {
      patterns: [{ name: 'entity.name.section.ld', match: '\\.(?:text|data|bss|rodata|isr_vector|init|fini|heap|stack|ARM\\.[\\w.]+)\\b' }],
    },

    numbers: {
      patterns: [
        { name: 'constant.numeric.hex.ld', match: '\\b0[xX][0-9a-fA-F]+\\b' },
        { name: 'constant.numeric.suffix.ld', match: '\\b\\d+[KMkm]\\b' },
        { name: 'constant.numeric.ld', match: '\\b\\d+\\b' },
      ],
    },

    symbols: {
      patterns: [
        { name: 'variable.other.ld', match: '\\b_(?:s|e)(?:data|text|bss|stack|idata|etext|edata|ebss)\\b' },
        { name: 'variable.other.ld', match: '\\b[A-Za-z_][A-Za-z0-9_]*\\b(?=\\s*=[^=])' },
      ],
    },

    strings: {
      patterns: [{ name: 'string.quoted.double.ld', match: '"(?:[^"\\\\]|\\\\.)*"' }],
    },
  },
};
