/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { CircularList } from './common/CircularList';
import { CharData, ITerminal, IBuffer, IBufferLine } from './Types';
import { EventEmitter } from './common/EventEmitter';
import { IMarker } from 'xterm';
import { BufferLine } from './BufferLine';
import { wcwidth } from './CharWidth';

export const DEFAULT_ATTR = (0 << 18) | (257 << 9) | (256 << 0);
export const CHAR_DATA_ATTR_INDEX = 0;
export const CHAR_DATA_CHAR_INDEX = 1;
export const CHAR_DATA_WIDTH_INDEX = 2;
export const CHAR_DATA_CODE_INDEX = 3;
export const MAX_BUFFER_SIZE = 4294967295; // 2^32 - 1

export const NULL_CELL_CHAR = ' ';
export const NULL_CELL_WIDTH = 1;
export const NULL_CELL_CODE = 32;

/**
 * This class represents a terminal buffer (an internal state of the terminal), where the
 * following information is stored (in high-level):
 *   - text content of this particular buffer
 *   - cursor position
 *   - scroll position
 */
export class Buffer implements IBuffer {
  public lines: CircularList<IBufferLine>;
  public ydisp: number;
  public ybase: number;
  public y: number;
  public x: number;
  public scrollBottom: number;
  public scrollTop: number;
  public tabs: any;
  public savedY: number;
  public savedX: number;
  public markers: Marker[] = [];

  /**
   * Create a new Buffer.
   * @param _terminal The terminal the Buffer will belong to.
   * @param _hasScrollback Whether the buffer should respect the scrollback of
   * the terminal.
   */
  constructor(
    private _terminal: ITerminal,
    private _hasScrollback: boolean
  ) {
    this.clear();
  }

  public get hasScrollback(): boolean {
    return this._hasScrollback && this.lines.maxLength > this._terminal.rows;
  }

  public get isCursorInViewport(): boolean {
    const absoluteY = this.ybase + this.y;
    const relativeY = absoluteY - this.ydisp;
    return (relativeY >= 0 && relativeY < this._terminal.rows);
  }

  /**
   * Gets the correct buffer length based on the rows provided, the terminal's
   * scrollback and whether this buffer is flagged to have scrollback or not.
   * @param rows The terminal rows to use in the calculation.
   */
  private _getCorrectBufferLength(rows: number): number {
    if (!this._hasScrollback) {
      return rows;
    }

    const correctBufferLength = rows + this._terminal.options.scrollback;

    return correctBufferLength > MAX_BUFFER_SIZE ? MAX_BUFFER_SIZE : correctBufferLength;
  }

  /**
   * Fills the buffer's viewport with blank lines.
   */
  public fillViewportRows(): void {
    if (this.lines.length === 0) {
      let i = this._terminal.rows;
      while (i--) {
        this.lines.push(BufferLine.blankLine(this._terminal.cols, DEFAULT_ATTR));
      }
    }
  }

  /**
   * Clears the buffer to it's initial state, discarding all previous data.
   */
  public clear(): void {
    this.ydisp = 0;
    this.ybase = 0;
    this.y = 0;
    this.x = 0;
    this.lines = new CircularList<IBufferLine>(this._getCorrectBufferLength(this._terminal.rows));
    this.scrollTop = 0;
    this.scrollBottom = this._terminal.rows - 1;
    this.setupTabStops();
  }

  /**
   * Resizes the buffer, adjusting its data accordingly.
   * @param newCols The new number of columns.
   * @param newRows The new number of rows.
   */
  public resize(newCols: number, newRows: number): void {
    return this._reflow_resize(newCols, newRows);
    
    // Increase max length if needed before adjustments to allow space to fill
    // as required.
    const newMaxLength = this._getCorrectBufferLength(newRows);
    if (newMaxLength > this.lines.maxLength) {
      this.lines.maxLength = newMaxLength;
    }

    // The following adjustments should only happen if the buffer has been
    // initialized/filled.
    if (this.lines.length > 0) {
      // Deal with columns increasing (we don't do anything when columns reduce)
      if (this._terminal.cols < newCols) {
        const ch: CharData = [DEFAULT_ATTR, NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE]; // does xterm use the default attr?
        for (let i = 0; i < this.lines.length; i++) {
          while (this.lines.get(i).length < newCols) {
            this.lines.get(i).push(ch);
          }
        }
      }

      // Resize rows in both directions as needed
      let addToY = 0;
      if (this._terminal.rows < newRows) {
        for (let y = this._terminal.rows; y < newRows; y++) {
          if (this.lines.length < newRows + this.ybase) {
            if (this.ybase > 0 && this.lines.length <= this.ybase + this.y + addToY + 1) {
              // There is room above the buffer and there are no empty elements below the line,
              // scroll up
              this.ybase--;
              addToY++;
              if (this.ydisp > 0) {
                // Viewport is at the top of the buffer, must increase downwards
                this.ydisp--;
              }
            } else {
              // Add a blank line if there is no buffer left at the top to scroll to, or if there
              // are blank lines after the cursor
              this.lines.push(BufferLine.blankLine(newCols, DEFAULT_ATTR));
            }
          }
        }
      } else { // (this._terminal.rows >= newRows)
        for (let y = this._terminal.rows; y > newRows; y--) {
          if (this.lines.length > newRows + this.ybase) {
            if (this.lines.length > this.ybase + this.y + 1) {
              // The line is a blank line below the cursor, remove it
              this.lines.pop();
            } else {
              // The line is the cursor, scroll down
              this.ybase++;
              this.ydisp++;
            }
          }
        }
      }

      // Reduce max length if needed after adjustments, this is done after as it
      // would otherwise cut data from the bottom of the buffer.
      if (newMaxLength < this.lines.maxLength) {
        // Trim from the top of the buffer and adjust ybase and ydisp.
        const amountToTrim = this.lines.length - newMaxLength;
        if (amountToTrim > 0) {
          this.lines.trimStart(amountToTrim);
          this.ybase = Math.max(this.ybase - amountToTrim, 0);
          this.ydisp = Math.max(this.ydisp - amountToTrim, 0);
        }
        this.lines.maxLength = newMaxLength;
      }

      // Make sure that the cursor stays on screen
      this.x = Math.min(this.x, newCols - 1);
      this.y = Math.min(this.y, newRows - 1);
      if (addToY) {
        this.y += addToY;
      }
      this.savedY = Math.min(this.savedY, newRows - 1);
      this.savedX = Math.min(this.savedX, newCols - 1);

      this.scrollTop = 0;
    }

    this.scrollBottom = newRows - 1;
  }

  private _reflow_resize(newCols: number, newRows: number): void {
    if (!this.lines.length) {
      return;
    }
    if (newCols === this._terminal.cols && newRows === this._terminal.rows) {
      return;
    }

    // get unwrapped line ranges with cell lengths
    let unwrapped = [];
    const it = new BufferStringIterator(this, true);
    while (it.hasNext()) {
      const lineData = it.next(true) as [{first: number, last: number}, string];
      unwrapped.push({range: lineData[0], width: stringWidth(lineData[1])});
    }
    // trim empty lines from the end
    let unwrappedEnd = unwrapped.length - 1;
    while (!unwrapped[unwrappedEnd].width && unwrappedEnd) {
      unwrappedEnd--;
    }

    // create new buffer line list
    const maxLength = this._getCorrectBufferLength(newRows);
    const lines = new CircularList<IBufferLine>(maxLength);

    // find start line
    let start = 0;
    let widthCount = 0;
    for (let i = unwrappedEnd; i >= 0; --i) {
      widthCount += Math.ceil(unwrapped[i].width / newCols) || 1;
      if (widthCount >= maxLength) {
        start = i;
        break;
      }
    }

    // iterate over all unwrapped lines
    let pos = 0;
    for (let i = start; i <= unwrappedEnd; ++i) {
      pos = 0;
      let newLine = BufferLine.blankLine(newCols, DEFAULT_ATTR, false); // first line is never wrapped
      chunk: for (let ol = unwrapped[i].range.first; ol < unwrapped[i].range.last; ++ol) {
        const oldLine = this.lines.get(ol);
        let oldPos = 0;
        while (oldPos < oldLine.length) {
          while (pos < newLine.length) {
            newLine.set(pos++, oldLine.get(oldPos++));
            if (oldPos >= oldLine.length) {
              continue chunk;
            }
          }
          lines.push(newLine);
          newLine = BufferLine.blankLine(newCols, DEFAULT_ATTR, true);
          pos = 0;
        }
      }
      // we are at the last row of the unwrapped line
      // copy only up to right trim width
      const lastRowWidth = stringWidth(this.translateBufferLineToString(unwrapped[i].range.last, true));
      const oldLine = this.lines.get(unwrapped[i].range.last);
      let oldPos = 0;
      oldLoop: while (oldPos < lastRowWidth) {
        while (pos < newLine.length) {
          newLine.set(pos++, oldLine.get(oldPos++));
          if (oldPos >= lastRowWidth) {
            break oldLoop;
          }
        }
        lines.push(newLine);
        newLine = BufferLine.blankLine(newCols, DEFAULT_ATTR, true);
        pos = 0;
      }
      lines.push(newLine);
    }

    // fill list at least up to terminal.rows
    while (lines.length < newRows) {
      lines.push(BufferLine.blankLine(newCols, DEFAULT_ATTR, false));
    }

    // FIXME: cursor repositioning
    if (lines.length < maxLength) {
      this.ydisp += lines.length - this.lines.length - (newRows - this._terminal.rows); 
      this.ybase += lines.length - this.lines.length - (newRows - this._terminal.rows);
    }

    const oldBufferContent = new BufferStringIterator(this, true).toArray();

    // apply new list to buffer and adjust bottom
    this.lines = lines;
    this.scrollBottom = newRows - 1;

    // assert equality
    const newBufferContent = new BufferStringIterator(this, true).toArray();
    console.log(oldBufferContent.length, newBufferContent.length);
    for (let i = 0; i <oldBufferContent.length; ++i) {
      if (oldBufferContent[i] !== newBufferContent[i]) {
        console.log([i, oldBufferContent[i], newBufferContent[i]]);
      }
    }
  }

  /**
   * Translates a buffer line to a string, with optional start and end columns.
   * Wide characters will count as two columns in the resulting string. This
   * function is useful for getting the actual text underneath the raw selection
   * position.
   * @param line The line being translated.
   * @param trimRight Whether to trim whitespace to the right.
   * @param startCol The column to start at.
   * @param endCol The column to end at.
   */
  public translateBufferLineToString(lineIndex: number, trimRight: boolean, startCol: number = 0, endCol: number = null): string {
    // Get full line
    let lineString = '';
    const line = this.lines.get(lineIndex);
    if (!line) {
      return '';
    }

    // Initialize column and index values. Column values represent the actual
    // cell column, indexes represent the index in the string. Indexes are
    // needed here because some chars are 0 characters long (eg. after wide
    // chars) and some chars are longer than 1 characters long (eg. emojis).
    let startIndex = startCol;
    // Only set endCol to the line length when it is null. 0 is a valid column.
    if (endCol === null) {
      endCol = line.length;
    }
    let endIndex = endCol;

    for (let i = 0; i < line.length; i++) {
      const char = line.get(i);
      lineString += char[CHAR_DATA_CHAR_INDEX];
      // Adjust start and end cols for wide characters if they affect their
      // column indexes
      if (char[CHAR_DATA_WIDTH_INDEX] === 0) {
        if (startCol >= i) {
          startIndex--;
        }
        if (endCol > i) {
          endIndex--;
        }
      } else {
        // Adjust the columns to take glyphs that are represented by multiple
        // code points into account.
        if (char[CHAR_DATA_CHAR_INDEX].length > 1) {
          if (startCol > i) {
            startIndex += char[CHAR_DATA_CHAR_INDEX].length - 1;
          }
          if (endCol > i) {
            endIndex += char[CHAR_DATA_CHAR_INDEX].length - 1;
          }
        }
      }
    }

    // Calculate the final end col by trimming whitespace on the right of the
    // line if needed.
    if (trimRight) {
      const rightWhitespaceIndex = lineString.search(/\s+$/);
      if (rightWhitespaceIndex !== -1) {
        endIndex = Math.min(endIndex, rightWhitespaceIndex);
      }
      // Return the empty string if only trimmed whitespace is selected
      if (endIndex <= startIndex) {
        return '';
      }
    }

    return lineString.substring(startIndex, endIndex);
  }

  public getWrappedRangeForLine(y: number): { first: number, last: number } {
    let first = y;
    let last = y;
    // Scan upwards for wrapped lines
    while (first > 0 && this.lines.get(first).isWrapped) {
      first--;
    }
    // Scan downwards for wrapped lines
    while (last + 1 < this.lines.length && this.lines.get(last + 1).isWrapped) {
      last++;
    }
    return { first, last };
  }

  /**
   * Setup the tab stops.
   * @param i The index to start setting up tab stops from.
   */
  public setupTabStops(i?: number): void {
    if (i !== null && i !== undefined) {
      if (!this.tabs[i]) {
        i = this.prevStop(i);
      }
    } else {
      this.tabs = {};
      i = 0;
    }

    for (; i < this._terminal.cols; i += this._terminal.options.tabStopWidth) {
      this.tabs[i] = true;
    }
  }

  /**
   * Move the cursor to the previous tab stop from the given position (default is current).
   * @param x The position to move the cursor to the previous tab stop.
   */
  public prevStop(x?: number): number {
    if (x === null || x === undefined) {
      x = this.x;
    }
    while (!this.tabs[--x] && x > 0);
    return x >= this._terminal.cols ? this._terminal.cols - 1 : x < 0 ? 0 : x;
  }

  /**
   * Move the cursor one tab stop forward from the given position (default is current).
   * @param x The position to move the cursor one tab stop forward.
   */
  public nextStop(x?: number): number {
    if (x === null || x === undefined) {
      x = this.x;
    }
    while (!this.tabs[++x] && x < this._terminal.cols);
    return x >= this._terminal.cols ? this._terminal.cols - 1 : x < 0 ? 0 : x;
  }

  public addMarker(y: number): Marker {
    const marker = new Marker(y);
    this.markers.push(marker);
    marker.register(this.lines.addDisposableListener('trim', amount => {
      marker.line -= amount;
      // The marker should be disposed when the line is trimmed from the buffer
      if (marker.line < 0) {
        marker.dispose();
      }
    }));
    marker.register(marker.addDisposableListener('dispose', () => this._removeMarker(marker)));
    return marker;
  }

  private _removeMarker(marker: Marker): void {
    // TODO: This could probably be optimized by relying on sort order and trimming the array using .length
    this.markers.splice(this.markers.indexOf(marker), 1);
  }
}

export class Marker extends EventEmitter implements IMarker {
  private static _nextId = 1;

  private _id: number = Marker._nextId++;
  public isDisposed: boolean = false;

  public get id(): number { return this._id; }

  constructor(
    public line: number
  ) {
    super();
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    // Emit before super.dispose such that dispose listeners get a change to react
    this.emit('dispose');
    super.dispose();
  }
}


export class BufferStringIterator {
  private _start: number;
  private _end: number;
  private _current: number;
  constructor (private _buffer: IBuffer, private _trimRight: boolean, startIndex?: number, endIndex?: number) {
    this._start = startIndex || 0;
    this._end = endIndex || this._buffer.lines.length;
    this._current = this._start;
  }
  public hasNext(): boolean {
    return this._current < this._end;
  }
  public next(withRanges: boolean = false): string | [{first: number, last: number}, string] {
    const range = this._buffer.getWrappedRangeForLine(this._current);
    let result = '';
    for (let i = range.first; i <= range.last; ++i) {
      result += this._buffer.translateBufferLineToString(i, (this._trimRight) ? i === range.last : false);
    }
    this._current = range.last;
    this._current++;
    return (withRanges) ? [range, result] : result;
  }
  toArray(): string[] {
    const result: string[] = [];
    while (this.hasNext()) {
      result.push(this.next() as string);
    }
    return result;
  }
}

export function stringWidth(s: string): number {
  let result = 0;
  for (let i = 0; i < s.length; ++i) {
    let code = s.charCodeAt(i);
    if (0xD800 <= code && code <= 0xDBFF) {
      const low = s.charCodeAt(i + 1);
      if (isNaN(low)) {
        return result;
      }
      code = ((code - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
    }
    if (0xDC00 <= code && code <= 0xDFFF) {
      continue;
    }
    result += wcwidth(code);
  }
  return result;
}
