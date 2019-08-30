import { Terminal, ITerminalAddon, IBufferCell } from 'xterm';

const enum Attributes {
  /**
   * bit 1..8     blue in RGB, color in P256 and P16
   */
  BLUE_MASK = 0xFF,
  BLUE_SHIFT = 0,
  PCOLOR_MASK = 0xFF,
  PCOLOR_SHIFT = 0,

  /**
   * bit 9..16    green in RGB
   */
  GREEN_MASK = 0xFF00,
  GREEN_SHIFT = 8,

  /**
   * bit 17..24   red in RGB
   */
  RED_MASK = 0xFF0000,
  RED_SHIFT = 16,

  /**
   * bit 25..26   color mode: DEFAULT (0) | P16 (1) | P256 (2) | RGB (3)
   */
  CM_MASK = 0x3000000,
  CM_DEFAULT = 0,
  CM_P16 = 0x1000000,
  CM_P256 = 0x2000000,
  CM_RGB = 0x3000000,

  /**
   * bit 1..24  RGB room
   */
  RGB_MASK = 0xFFFFFF
}

const enum FgFlags {
  /**
   * bit 27..31 (32th bit unused)
   */
  INVERSE = 0x4000000,
  BOLD = 0x8000000,
  UNDERLINE = 0x10000000,
  BLINK = 0x20000000,
  INVISIBLE = 0x40000000
}

const enum BgFlags {
  /**
   * bit 27..32 (upper 4 unused)
   */
  ITALIC = 0x4000000,
  DIM = 0x8000000
}

export class SerializeAddon implements ITerminalAddon {
  private _terminal: Terminal|undefined = undefined;
  public dispose(): void {}
  public activate(terminal: Terminal): void {
    this._terminal = terminal;
  }

  private _extractAttributes(oldCell: IBufferCell, newCell: IBufferCell): string {
    const switches: number[] = [];
    // flags
    if (!oldCell.equalFlags(newCell)) {
      if (oldCell.isBold() !== newCell.isBold()) switches.push(newCell.isBold() ? 1 : 22);
      if (oldCell.isUnderline() !== newCell.isUnderline()) switches.push(newCell.isUnderline() ? 4 : 24);
      if (oldCell.isInverse() !== newCell.isInverse()) switches.push(newCell.isInverse() ? 7 : 27);
      if (oldCell.isInvisible() !== newCell.isInvisible()) switches.push(newCell.isInvisible() ? 8 : 28);
      if (oldCell.isBlink() !== newCell.isBlink()) switches.push(newCell.isBlink() ? 5 : 25);
      if (oldCell.isItalic() !== newCell.isItalic()) switches.push(newCell.isItalic() ? 3 : 23);
      if (oldCell.isDim() !== newCell.isDim()) switches.push(newCell.isDim() ? 2 : 22);
    }
    // colors
    if (!oldCell.equalFg(newCell)) {
      const color = newCell.getFgColor();
      switch (newCell.getFgColorMode()) {
        case 'RGB':
          switches.push(38);
          switches.push(2);
          switches.push((color >> 16) & 0xFF);
          switches.push((color >> 8) & 0xFF);
          switches.push(color & 0xFF);
          break;
        case 'P256':
          switches.push(38);
          switches.push(5);
          switches.push(color);
          break;
        case 'P16':
          switches.push(color & 8 ? 90 + (color & 7) : 30 + (color & 7));
          break;
        default:
          switches.push(39);
      }
    }
    if (!oldCell.equalBg(newCell)) {
      const color = newCell.getBgColor();
      switch (newCell.getBgColorMode()) {
        case 'RGB':
          switches.push(48);
          switches.push(2);
          switches.push((color >> 16) & 0xFF);
          switches.push((color >> 8) & 0xFF);
          switches.push(color & 0xFF);
          break;
        case 'P256':
          switches.push(48);
          switches.push(5);
          switches.push(color);
          break;
        case 'P16':
          switches.push(color & 8 ? 100 + (color & 7) : 40 + (color & 7));
          break;
        default:
          switches.push(49);
      }
    }
    return `\x1b[${switches.join(';')}m`;
  }

  public serialize(): string {
    if (!this._terminal) {
      return '';
    }

    // cells for ref style usage
    // we need two of them to flip between old and new cell
    const cell1 = this._terminal.buffer.getNullCell();
    const cell2 = this._terminal.buffer.getNullCell();
    let oldCell = cell1;

    const result: string[] = [];

    const end = this._terminal.buffer.length;
    const buffer = this._terminal.buffer;
    for (let y = 0; y < end; ++y) {
      const sLine: string[] = [];
      const line = buffer.getLine(y);
      if (!line) {
        continue;
      }
      const length = this._terminal.cols;
      for (let x = 0; x < length;) {
        const newCell = line.getCell(x, oldCell === cell1 ? cell2 : cell1);
        if (!newCell) {
          continue;
        }
        if (!oldCell.equalAttibutes(newCell)) {
          sLine.push(this._extractAttributes(oldCell, newCell));
          oldCell = newCell;
        }
        sLine.push(newCell.getChars() || ' ');
        x += newCell.getWidth() || 1;  // always advance by 1!
      }
      result.push(sLine.join(''));
    }
    return result.join('\r\n');
  }


  private _extractAttributesPrivate(oldCell: any, newCell: any): string {
    const switches: number[] = [];
    if (oldCell.fg !== newCell.fg) {
      // flags
      if ((oldCell.fg & FgFlags.INVERSE) !== (newCell.fg & FgFlags.INVERSE)) {
        switches.push(newCell.fg & FgFlags.INVERSE ? 7 : 27);
      }
      if ((oldCell.fg & FgFlags.BOLD) !== (newCell.fg & FgFlags.BOLD)) {
        switches.push(newCell.fg & FgFlags.BOLD ? 1 : 22);
      }
      if ((oldCell.fg & FgFlags.UNDERLINE) !== (newCell.fg & FgFlags.UNDERLINE)) {
        switches.push(newCell.fg & FgFlags.UNDERLINE ? 4 : 24);
      }
      if ((oldCell.fg & FgFlags.BLINK) !== (newCell.fg & FgFlags.BLINK)) {
        switches.push(newCell.fg & FgFlags.BLINK ? 5 : 25);
      }
      if ((oldCell.fg & FgFlags.INVISIBLE) !== (newCell.fg & FgFlags.INVISIBLE)) {
        switches.push(newCell.fg & FgFlags.INVISIBLE ? 8 : 28);
      }
      // colors
      if ((oldCell.fg & (Attributes.CM_MASK | Attributes.RGB_MASK)) !== (newCell.fg & (Attributes.CM_MASK | Attributes.RGB_MASK))) {
        switch (newCell.fg & Attributes.CM_MASK) {
          case Attributes.CM_P16:
            switches.push(newCell.fg & 8 ? 90 + (newCell.fg & 7) : 30 + (newCell.fg & 7));
            break;
          case Attributes.CM_P256:
            switches.push(38);
            switches.push(5);
            switches.push(newCell.fg & 0xFF);
            break;
          case Attributes.CM_RGB:
            switches.push(38);
            switches.push(2);
            switches.push((newCell.fg >> 16) & 0xFF);
            switches.push((newCell.fg >> 8) & 0xFF);
            switches.push(newCell.fg & 0xFF);
            break;
          default:
            switches.push(39);
        }
      }
    }
    if (oldCell.bg !== newCell.bg) {
      // flags
      if ((oldCell.bg & BgFlags.ITALIC) !== (newCell.bg & BgFlags.ITALIC)) {
        switches.push(newCell.bg & BgFlags.ITALIC ? 3 : 23);
      }
      if ((oldCell.bg & BgFlags.DIM) !== (newCell.bg & BgFlags.DIM)) {
        switches.push(newCell.bg & BgFlags.DIM ? 2 : 22);
      }
      // colors
      if ((oldCell.bg & (Attributes.CM_MASK | Attributes.RGB_MASK)) !== (newCell.bg & (Attributes.CM_MASK | Attributes.RGB_MASK))) {
        switch (newCell.bg & Attributes.CM_MASK) {
          case Attributes.CM_P16:
            switches.push(newCell.bg & 8 ? 100 + (newCell.bg & 7) : 40 + (newCell.bg & 7));
            break;
          case Attributes.CM_P256:
            switches.push(48);
            switches.push(5);
            switches.push(newCell.bg & 0xFF);
            break;
          case Attributes.CM_RGB:
            switches.push(48);
            switches.push(2);
            switches.push((newCell.bg >> 16) & 0xFF);
            switches.push((newCell.bg >> 8) & 0xFF);
            switches.push(newCell.bg & 0xFF);
            break;
          default:
            switches.push(49);
        }
      }
    }
    return `\x1b[${switches.join(';')}m`;
  }

  public serializePrivate(): string {
    if (!this._terminal) {
      return '';
    }

    // grab cell ctor from private
    const ctor = (this._terminal as any)._core._inputHandler._workCell.constructor;
    const cell1 = new ctor();
    const cell2 = new ctor();
    let oldCell = cell1;

    const result: string[] = [];

    const end = this._terminal.buffer.length;
    for (let y = 0; y < end; ++y) {
      const sLine: string[] = [];
      const line = (this._terminal as any)._core.buffer.lines.get(y);
      const length = line.length;
      for (let x = 0; x < length;) {
        const newCell = line.loadCell(x, oldCell === cell1 ? cell2 : cell1);
        if (oldCell.fg !== newCell.fg || oldCell.bg !== newCell.bg) {
          sLine.push(this._extractAttributesPrivate(oldCell, newCell));
          oldCell = newCell;
        }
        sLine.push(newCell.getChars() || ' ');
        x += newCell.getWidth() || 1;
      }
      result.push(sLine.join(''));
    }
    return result.join('\r\n');
  }
}
