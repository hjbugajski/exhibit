/**
 * House port of the strato VS Code theme (hjbugajski/strato-vscode): the scope table is copied
 * verbatim from the light theme, but every color is a `var(--shiki-*)` reference that styles.css
 * resolves onto the house scales — one table serves both schemes, and retuning a slot is a
 * one-line styles.css edit. Strato's color roles: strings green, numbers/constants/attributes/
 * user types orange, keywords + JSON keys pink, functions/built-in types/links blue, symbolic
 * operators/tags violet, modules/invalid red, markdown headings amber, comments italic muted,
 * brackets/commas muted, plain identifiers foreground.
 *
 * Only ever imported dynamically (from src/lib/shiki.ts), so it lives in the shiki async chunk.
 */
import type { ThemeRegistrationAny } from '@shikijs/core';

export const shikiTheme: ThemeRegistrationAny = {
  name: 'exhibit',
  type: 'dark',
  colors: {
    'editor.foreground': 'var(--shiki-foreground)',
    'editor.background': 'var(--color-background)',
  },
  tokenColors: [
    {
      name: 'Plain',
      scope: ['source', 'support.type.property-name.css'],
      settings: {
        foreground: 'var(--shiki-foreground)',
      },
    },
    {
      name: 'Comments',
      scope: [
        'comment',
        'punctuation.definition.comment',
        'comment.documentation',
        'comment.line.documentation',
        'string.comment',
      ],
      settings: {
        foreground: 'var(--shiki-token-comment)',
        fontStyle: 'italic',
      },
    },
    {
      name: 'Strings',
      scope: [
        'string',
        'string.quoted',
        'string.template',
        'string.regexp',
        'string.other.link',
        'markup.inline.raw.string.markdown',
        'markup.inline.raw.code.mdx',
      ],
      settings: {
        foreground: 'var(--shiki-token-string)',
      },
    },
    {
      name: 'String escape sequences',
      scope: ['constant.character.escape', 'constant.other.placeholder'],
      settings: {
        foreground: 'var(--shiki-foreground)',
      },
    },
    {
      name: 'String quote marks (" \')',
      scope: [
        'punctuation.definition.string',
        'punctuation.definition.string.begin',
        'punctuation.definition.string.end',
        'punctuation.definition.string.template.begin',
        'punctuation.definition.string.template.end',
      ],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
      },
    },
    {
      name: 'Numbers',
      scope: ['constant.numeric'],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'Language constants (true / false / null / undefined / this)',
      scope: [
        'constant.language',
        'constant.language.boolean',
        'constant.language.json',
        'constant.language.null',
        'constant.language.undefined',
        'variable.language',
        'variable.language.this',
        'variable.other.global',
      ],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'Named constants',
      scope: [
        'variable.other.constant',
        'variable.readonly',
        'constant.other',
        'support.constant',
        'entity.name.constant',
      ],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'Keywords (word-style: if, else, return, await, typeof, new, ...)',
      scope: [
        'keyword',
        'keyword.control',
        'keyword.control.import',
        'keyword.control.from',
        'keyword.control.exception',
        'keyword.control.trycatch',
        'keyword.import',
        'keyword.operator.expression',
        'keyword.operator.new',
        'keyword.operator.delete',
        'keyword.operator.of',
        'keyword.operator.in',
        'keyword.operator.typeof',
        'keyword.operator.instanceof',
        'keyword.operator.void',
        'keyword.operator.await',
        'keyword.operator.yield',
      ],
      settings: {
        foreground: 'var(--shiki-token-keyword)',
      },
    },
    {
      name: 'Storage modifiers',
      scope: ['storage', 'storage.type', 'storage.modifier', 'keyword.modifier'],
      settings: {
        foreground: 'var(--shiki-token-keyword)',
      },
    },
    {
      name: 'Functions',
      scope: [
        'entity.name.function',
        'support.function',
        'meta.function-call.generic',
        'meta.function-call entity.name.function',
      ],
      settings: {
        foreground: 'var(--shiki-token-function)',
      },
    },
    {
      name: 'Methods',
      scope: ['entity.name.function.method', 'meta.function.method'],
      settings: {
        foreground: 'var(--shiki-token-function)',
      },
    },
    {
      name: 'Function calls (plain identifiers)',
      scope: ['variable.function'],
      settings: {
        foreground: 'var(--shiki-foreground)',
      },
    },
    {
      name: 'Symbolic operators (=, =>, +, -, *, /, &&, ||, !, ?, :, ?., ??, ..., bitwise, type unions)',
      scope: [
        'keyword.operator.assignment',
        'keyword.operator.arithmetic',
        'keyword.operator.comparison',
        'keyword.operator.relational',
        'keyword.operator.logical',
        'keyword.operator.ternary',
        'keyword.operator.bitwise',
        'keyword.operator.spread',
        'keyword.operator.rest',
        'keyword.operator.optional',
        'keyword.operator.nullish-coalescing',
        'keyword.operator.type',
        'keyword.operator.type.annotation',
        'keyword.operator.definiteassignment',
        'keyword.operator.assignment.compound',
        'keyword.operator.increment',
        'keyword.operator.decrement',
        'storage.type.function.arrow',
      ],
      settings: {
        foreground: 'var(--shiki-token-operator)',
      },
    },
    {
      name: 'Colons (object key:value, JSX attr=)',
      scope: ['punctuation.separator.key-value', 'punctuation.separator.colon'],
      settings: {
        foreground: 'var(--shiki-token-operator)',
      },
    },
    {
      name: 'Commas and semicolons',
      scope: [
        'punctuation.separator.comma',
        'punctuation.separator.parameter',
        'punctuation.separator.delimiter',
        'punctuation.terminator.statement',
        'punctuation.terminator.expression',
        'punctuation.terminator.rule',
      ],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
      },
    },
    {
      name: 'Macros / preprocessor',
      scope: ['entity.name.function.preprocessor', 'meta.preprocessor'],
      settings: {
        foreground: 'var(--shiki-token-function)',
      },
    },
    {
      name: 'URLs / links',
      scope: ['markup.underline.link', 'string.other.link.destination.mdx'],
      settings: {
        foreground: 'var(--shiki-token-function)',
      },
    },
    {
      name: 'Variables / parameters / properties',
      scope: [
        'variable',
        'variable.other',
        'variable.other.readwrite',
        'variable.other.object',
        'variable.other.object.property',
        'variable.other.property',
        'variable.other.readwrite.alias',
        'variable.parameter',
        'variable.parameter.function',
        'meta.parameter',
        'meta.variable',
        'meta.property',
      ],
      settings: {
        foreground: 'var(--shiki-foreground)',
      },
    },
    {
      name: 'Object keys (JS / TS literals)',
      scope: ['meta.object-literal.key', 'support.type.property-name', 'variable.object.property'],
      settings: {
        foreground: 'var(--shiki-foreground)',
      },
    },
    {
      name: 'JSON / JSONC / JSON5 property keys',
      scope: [
        'support.type.property-name.json',
        'support.type.property-name.jsonc',
        'support.type.property-name.json5',
        'meta.structure.dictionary.json support.type.property-name',
        'meta.structure.dictionary.value.json support.type.property-name',
      ],
      settings: {
        foreground: 'var(--shiki-token-keyword)',
      },
    },
    {
      name: 'Classes / interfaces / structs / enums (user-defined)',
      scope: [
        'entity.name.type.class',
        'entity.name.class',
        'entity.name.type.interface',
        'entity.name.interface',
        'entity.name.type.struct',
        'entity.name.type.enum',
        'entity.name.type',
        'entity.other.inherited-class',
        'support.class',
        'meta.return.type',
        'meta.type.annotation',
      ],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'Built-in / library types',
      scope: ['support.type', 'support.type.primitive', 'support.type.builtin'],
      settings: {
        foreground: 'var(--shiki-token-function)',
      },
    },
    {
      name: 'Type parameters',
      scope: ['variable.type.parameter', 'variable.parameter.type'],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'HTML / JSX tags',
      scope: ['entity.name.tag', 'meta.tag entity.name.tag'],
      settings: {
        foreground: 'var(--shiki-token-operator)',
      },
    },
    {
      name: 'JSX components (capitalized)',
      scope: ['support.class.component'],
      settings: {
        foreground: 'var(--shiki-token-function)',
      },
    },
    {
      name: 'HTML / JSX attributes',
      scope: ['entity.other.attribute-name', 'meta.attribute'],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'Namespaces',
      scope: ['entity.name.namespace', 'storage.modifier.namespace', 'markup.bold.markdown'],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'Modules',
      scope: ['entity.name.module', 'storage.modifier.module', 'support.module'],
      settings: {
        foreground: 'var(--shiki-token-deleted)',
      },
    },
    {
      name: 'Decorators',
      scope: ['meta.decorator', 'punctuation.decorator', 'entity.name.function.decorator'],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'Labels',
      scope: ['entity.name.label', 'punctuation.definition.label'],
      settings: {
        foreground: 'var(--shiki-token-keyword)',
      },
    },
    {
      name: 'Punctuation (general, accessors, tag delimiters)',
      scope: [
        'punctuation',
        'punctuation.separator',
        'punctuation.terminator',
        'punctuation.accessor',
        'punctuation.definition.tag',
      ],
      settings: {
        foreground: 'var(--shiki-foreground)',
      },
    },
    {
      name: 'Code brackets ( ) [ ] { }',
      scope: [
        'meta.brace',
        'meta.brace.round',
        'meta.brace.square',
        'meta.brace.curly',
        'meta.bracket',
        'punctuation.section.array',
        'punctuation.section.array.begin',
        'punctuation.section.array.end',
        'punctuation.section.parens',
        'punctuation.section.parens.begin',
        'punctuation.section.parens.end',
        'punctuation.section.parameters',
        'punctuation.section.parameters.begin',
        'punctuation.section.parameters.end',
        'punctuation.section.arguments',
        'punctuation.section.arguments.begin',
        'punctuation.section.arguments.end',
        'punctuation.section.block',
        'punctuation.section.block.begin',
        'punctuation.section.block.end',
        'punctuation.section.brackets',
        'punctuation.section.brackets.begin',
        'punctuation.section.brackets.end',
        'punctuation.section.group',
        'punctuation.section.embedded',
        'punctuation.section.embedded.begin',
        'punctuation.section.embedded.end',
        'punctuation.definition.parameters',
        'punctuation.definition.arguments',
        'punctuation.definition.block',
        'punctuation.definition.array',
        'punctuation.definition.bracket',
        'punctuation.definition.dictionary',
        'punctuation.definition.template-expression',
        'punctuation.definition.template-expression.begin',
        'punctuation.definition.template-expression.end',
      ],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
      },
    },
    {
      name: 'Template expression content (inside ${})',
      scope: ['meta.template.expression'],
      settings: {
        foreground: 'var(--shiki-foreground)',
      },
    },
    {
      name: 'Markdown headings',
      scope: [
        'markup.heading',
        'markup.heading.markdown',
        'markup.heading.mdx',
        'entity.name.section',
        'entity.name.section.markdown',
        'entity.name.section.mdx',
      ],
      settings: {
        foreground: 'var(--shiki-token-heading)',
      },
    },
    {
      name: 'Markdown heading punctuation (# markers)',
      scope: ['punctuation.definition.heading.markdown', 'punctuation.definition.heading.mdx'],
      settings: {
        foreground: 'var(--shiki-token-keyword)',
      },
    },
    {
      name: 'Markdown italic',
      scope: ['markup.italic'],
      settings: {
        fontStyle: 'italic',
      },
    },
    {
      name: 'Markdown list markers (-, *, +, 1.)',
      scope: [
        'punctuation.definition.list.begin.markdown',
        'punctuation.definition.quote.begin.markdown',
        'variable.ordered.list.mdx',
        'variable.unordered.list.mdx',
      ],
      settings: {
        foreground: 'var(--shiki-token-constant)',
      },
    },
    {
      name: 'Markdown emphasis markers (** __ * _)',
      scope: [
        'punctuation.definition.bold.markdown',
        'punctuation.definition.italic.markdown',
        'punctuation.definition.bold.begin.markdown',
        'punctuation.definition.bold.end.markdown',
        'punctuation.definition.italic.begin.markdown',
        'punctuation.definition.italic.end.markdown',
      ],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
      },
    },
    {
      name: 'Markdown inline code backticks',
      scope: ['punctuation.definition.raw.markdown', 'punctuation.definition.markdown'],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
      },
    },
    {
      name: 'Markdown strikethrough text and markers',
      scope: [
        'markup.strikethrough',
        'markup.strikethrough.markdown',
        'punctuation.definition.strikethrough.markdown',
      ],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
        fontStyle: 'strikethrough',
      },
    },
    {
      name: 'Markdown table pipes and header separators',
      scope: [
        'punctuation.separator.table.markdown',
        'punctuation.definition.table.markdown',
        'markup.table.separator.markdown',
        'meta.table.header.separator.markdown',
        'markup.table.header.separator.markdown',
        'markup.table.markdown punctuation',
      ],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
      },
    },
    {
      name: 'Markdown horizontal rule (---)',
      scope: [
        'meta.separator.markdown',
        'punctuation.definition.separator.markdown',
        'markup.separator.markdown',
      ],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
      },
    },
    {
      name: 'Markdown task list checkboxes ([ ] [x])',
      scope: [
        'markup.list.task.checked.markdown',
        'markup.list.task.unchecked.markdown',
        'punctuation.definition.task.markdown',
        'markup.checkbox.markdown',
        'beginning.punctuation.definition.list.markdown',
      ],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
      },
    },
    {
      name: 'Diff inserted',
      scope: ['markup.inserted'],
      settings: {
        foreground: 'var(--shiki-token-inserted)',
      },
    },
    {
      name: 'Diff deleted',
      scope: ['markup.deleted'],
      settings: {
        foreground: 'var(--shiki-token-deleted)',
      },
    },
    {
      name: 'Diff changed',
      scope: ['markup.changed'],
      settings: {
        foreground: 'var(--shiki-token-changed)',
      },
    },
    {
      name: 'Diff header',
      scope: ['meta.diff.header', 'meta.diff.range'],
      settings: {
        foreground: 'var(--shiki-token-function)',
      },
    },
    {
      name: 'Invalid',
      scope: ['invalid', 'invalid.illegal'],
      settings: {
        foreground: 'var(--shiki-token-deleted)',
      },
    },
    {
      name: 'Deprecated',
      scope: ['invalid.deprecated'],
      settings: {
        foreground: 'var(--shiki-token-punctuation)',
        fontStyle: 'strikethrough',
      },
    },
  ],
};
