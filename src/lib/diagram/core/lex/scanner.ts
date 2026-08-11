/*
 * Character cursor over one logical line. Spans it produces are already in source coordinates, so
 * a parser never has to translate offsets itself.
 */

import type { Span } from '../../types.ts';

const stickyCache = new WeakMap<RegExp, RegExp>();

/** Anchored matching needs the `y` flag; a caller's un-sticky pattern is cloned once and cached. */
function sticky(re: RegExp): RegExp {
  if (re.sticky) {
    return re;
  }

  const cached = stickyCache.get(re);

  if (cached) {
    return cached;
  }

  const clone = new RegExp(re.source, `${re.flags.replace('g', '')}y`);

  stickyCache.set(re, clone);

  return clone;
}

export class Scanner {
  readonly text: string;
  readonly base: Span;
  pos = 0;

  constructor(text: string, base: Span) {
    this.text = text;
    this.base = base;
  }

  get done(): boolean {
    return this.pos >= this.text.length;
  }

  peek(offset = 0): string {
    return this.text[this.pos + offset] ?? '';
  }

  startsWith(literal: string): boolean {
    return this.text.startsWith(literal, this.pos);
  }

  eat(literal: string): boolean {
    if (!this.startsWith(literal)) {
      return false;
    }

    this.pos += literal.length;

    return true;
  }

  /** Anchored match at the cursor; advances past the match on a hit. */
  match(re: RegExp): RegExpExecArray | null {
    const pattern = sticky(re);

    pattern.lastIndex = this.pos;

    const found = pattern.exec(this.text);

    if (found) {
      this.pos = pattern.lastIndex;
    }

    return found;
  }

  skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos] as string)) {
      this.pos += 1;
    }
  }

  rest(): string {
    return this.text.slice(this.pos);
  }

  /** Span covering `[start, pos)` of this line, mapped into the source. */
  spanFrom(start: number): Span {
    return {
      offset: this.base.offset + start,
      length: Math.max(0, this.pos - start),
      line: this.base.line,
      column: this.base.column + start,
    };
  }
}
