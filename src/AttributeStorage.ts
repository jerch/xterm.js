/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { PoolMemory, Address, ctypes, IMemory } from './Memory';

/**
 * Structure class of attribute tree nodes.
 * Due to costly conversion overhead objects of the class are not
 * used by the tree, the tree instead reads/writes directly
 * to the memory offsets (see EN definition below).
 */
export class CNode extends ctypes.Structure {
  static typename = 'CNode';
  static fields: [string, ctypes.ICTypeConstructor<any>][] = [
    /** node color red/black */
    ['color', ctypes.Uint32],
    /** node left child */
    ['left', ctypes.pointer<CNode>(CNode)],
    /** node right child */
    ['right', ctypes.pointer<CNode>(CNode)],
    /** data entries */
    ['flags', ctypes.Uint32],
    ['fg', ctypes.Uint32],
    ['bg', ctypes.Uint32],
    ['ref', ctypes.Uint32]
  ];
}

/**
 * int32 based offsets of `CNode` members.
 * Used by the tree for fast direct memory access.
 * The values must be in sync with the byte aligment
 * in `CNode`. Instead of using the aligment values
 * we define it as const enum to get plain numbers in JS
 * and thus avoid costly runtime lookups.
 */
const enum EN {
  COLOR = 0,
  LEFT = 1,
  RIGHT = 2,
  FLAGS = 3,
  FG = 4,
  BG = 5,
  REF = 6
}

 /**
  * Red-Black tree for attributes `flags`, `fg` and `bg`.
  * The tree is used by `AttributeStorage` to avoid double saving of identical attributes.
  * The data is saved in typed array memory, a single node is of the type `CNode`.
  * To speedup things the tree reads and writes the Uint32Array memory directly
  * rather than using `CNode`.
  * The tree uses incremental top-down insert and remove (non recursive).
  * Tree algorithms taken from: http://eternallyconfuzzled.com/tuts/datastructures/jsw_tut_rbtree.aspx
  *
  * Note: Typescript lacks preprocessing macros, thus any more general purpose
  * tree class abstraction would lead to a big runtime penalty. Therefore the tree
  * was hardcoded to the needs at hand. The code still can be reused for other means
  * by changing the following:
  *   - adjust node struct to your data needs (see `CNode`)
  *   - adjust `EN` to new struct layout
  *   - adjust block size of `PoolMemory` to your struct size
  *   - change `createNode` and `resetFake` to reflect your data and struct size
  *   - change `compare` method and signature
  *   - change calls of `compare` in `insert`, `remove` and `find`
  *   - change data moving in `remove`
  * TODO: Atm the tree holds the 1 bit color in a separate 4 byte slot which is a waste of memory.
  * Again due to the lack of a code preprocessor there is no good way to circumvent this
  * without a runtime penalty (insert will slow down >3x).
  */
export class AttributeTree {
  root: Address;
  fakeroot: Address;
  size: number;
  constructor(public m: IMemory) {
    this.fakeroot = this.createNode(0, 0, 0);
    this.size = 0;
  }
  /** Create a new node */
  createNode(flags: number, fg: number, bg: number): Address {
    const idx = this.m.alloc(CNode.bytes) >>> 2;
    this.m.data[idx + EN.COLOR] = 1;
    this.m.data[idx + EN.LEFT] = 0;
    this.m.data[idx + EN.RIGHT] = 0;
    this.m.data[idx + EN.FLAGS] = flags;
    this.m.data[idx + EN.FG] = fg;
    this.m.data[idx + EN.BG] = bg;
    this.m.data[idx + EN.REF] = 0;
    return idx;
  }
  resetFake(): Address {
    this.m.data[this.fakeroot + EN.COLOR] = 0;
    this.m.data[this.fakeroot + EN.LEFT] = 0;
    this.m.data[this.fakeroot + EN.RIGHT] = 0;
    this.m.data[this.fakeroot + EN.FLAGS] = 0;
    this.m.data[this.fakeroot + EN.FG] = 0;
    this.m.data[this.fakeroot + EN.BG] = 0;
    this.m.data[this.fakeroot + EN.REF] = 0;
    return this.fakeroot;
  }
  compare(flagsA: number, fgA: number, bgA: number, flagsB: number, fgB: number, bgB: number): number {
    if (flagsA > flagsB) return 1;
    if (flagsA < flagsB) return -1;
    if (fgA > fgB) return 1;
    if (fgA < fgB) return -1;
    if (bgA > bgB) return 1;
    if (bgA < bgB) return -1;
    return 0;
  }
  single(m: Uint32Array, root: Address, dir: number): Address {
    const save = m[root + EN.LEFT + +!dir];
    m[root + EN.LEFT + +!dir] = m[save + EN.LEFT + dir];
    m[save + EN.LEFT + dir] = root;
    m[root + EN.COLOR] = 1;
    m[save + EN.COLOR] = 0;
    return save;
  }
  double(m: Uint32Array, root: Address, dir: number): Address {
    m[root + EN.LEFT + +!dir] = this.single(m, m[root + EN.LEFT + +!dir], +!dir);
    return this.single(m, root, dir);
  }
  /**
   * Insert a node with attributes `flags`, `fg`and `bg` into the tree.
   * Returns the Uint32Array based address of the node
   * (0 if it was not found and could not be created).
   * To work as an address for `CNode` the return value needs
   * to be left shifted by 2, e.g. `value << 2`.
   * @param flags
   * @param fg
   * @param bg
   */
  insert(flags: number, fg: number, bg: number): number {
    if (!this.root) {
      this.root = this.createNode(flags, fg, bg);
      this.size++;
      this.m.data[this.root + EN.COLOR] = 0;
      return this.root;
    }
    let result = 0;
    let m = this.m.data;            // localize memory
    const head = this.resetFake();  // fake tree root
    let g = 0;                      // grandparent
    let t = 0;                      // grandparent/grandgrandparent
    let p = 0;                      // parent
    let q = 0;                      // iterator
    let dir = 0;                    // left/right direction
    let last = 0;                   // previous direction
    let h1 = 0;                     // helper
    let h2 = 0;                     // helper
    t = head;
    g = p = 0;
    q = m[t + EN.LEFT + 1] = this.root;
    for (;;) {
      if (!q) {
        // insert new node at bottom
        q = this.createNode(flags, fg, bg); // might change M!
        m = this.m.data;
        m[p + EN.LEFT + dir] = q;
        this.size++;
      } else if ((h1 = m[q + EN.LEFT + 0]) && m[h1 + EN.COLOR]
              && (h2 = m[q + EN.LEFT + 1]) && m[h2 + EN.COLOR]) {
        // color flip
        m[q + EN.COLOR] = 1;
        m[h1 + EN.COLOR] = 0;
        m[h2 + EN.COLOR] = 0;
      }
      // fix red violation
      if (p && m[p + EN.COLOR] && m[q + EN.COLOR]) {
        const dir2 = (m[t + EN.LEFT + 1] === g);
        if (q === m[p + EN.LEFT + last]) m[t + EN.LEFT + +dir2] = this.single(m, g, +!last);
        else m[t + EN.LEFT + +dir2] = this.double(m, g, +!last);
      }
      // compare data part, set result and break loop if match
      const cmp = this.compare(m[q + EN.FLAGS], m[q + EN.FG], m[q + EN.BG], flags, fg, bg);
      if (!cmp) {
        result = q;
        break;
      }
      last = dir;
      dir = +(cmp < 0);
      if (g) t = g;
      g = p;
      p = q;
      q = m[q + EN.LEFT + dir];
    }
    // update root, color black
    this.root = m[head + EN.LEFT + 1];
    this.m.data[this.root + EN.COLOR] = 0;
    return result;
  }
  /**
   * Remove a node from the tree containing `flags`, `fg` and `bg`.
   * Returns for success, 0 if no node was found.
   * @param flags
   * @param fg
   * @param bg
   */
  remove(flags: number, fg: number, bg: number): number {
    if (!this.root) return 0;
    const m = this.m.data;          // localize memory
    const head = this.resetFake();  // fake tree root
    let result = 0;                 // 1 for success, 0 for not found
    let q = 0;                      // iterator
    let p = 0;                      // parent
    let g = 0;                      // grandparent
    let f = 0;                      // found item
    let dir = 1;                    // left/right direction
    let h1 = 0;                     // assignment helper
    let h2 = 0;                     // assignment helper
    q = head;
    g = p = 0;
    m[q + EN.LEFT + 1] = this.root;
    // search and push a red down
    while (h1 = m[q + EN.LEFT + dir]) {
      const last = dir;
      g = p;
      p = q;
      q = h1;
      // compare values, save in f if match
      const cmp = this.compare(m[q + EN.FLAGS], m[q + EN.FG], m[q + EN.BG], flags, fg, bg);
      dir = +(cmp < 0);
      if (!cmp) f = q;
      // push red node down
      if (!m[q + EN.COLOR] && !((h1 = m[q + EN.LEFT + dir]) && m[h1 + EN.COLOR])) {
        if ((h1 = m[q + EN.LEFT + +!dir]) && m[h1 + EN.COLOR]) {
          p = m[p + EN.LEFT + last] = this.single(m, q, dir);
        } else if (!h1 || !m[h1 + EN.COLOR]) {
          const s = m[p + EN.LEFT + +!last];
          if (s) {
            h1 = m[s + EN.LEFT + +!last];
            h2 = m[s + EN.LEFT + last];
            if (!(h1 && m[h1 + EN.COLOR]) && !(h2 && m[h2 + EN.COLOR])) {
              // color flip
              m[p + EN.COLOR] = 0;
              m[s + EN.COLOR] = 1;
              m[q + EN.COLOR] = 1;
            } else {
              const dir2 = m[g + EN.LEFT + 1] === p;
              if (h2 && m[h2 + EN.COLOR]) {
                m[g + EN.LEFT + +dir2] = h1 = this.double(m, p, last);
              } else if (h1 && m[h1 + EN.COLOR]) {
                m[g + EN.LEFT + +dir2] = h1 = this.single(m, p, last);
              }
              // ensure correct coloring
              m[q + EN.COLOR] = m[h1 + EN.COLOR] = 1;
              m[m[h1 + EN.LEFT + 0] + EN.COLOR] = 0;
              m[m[h1 + EN.LEFT + 1] + EN.COLOR] = 0;
            }
          }
        }
      }
    }
    // remove found item
    if (f) {
      // move data parts from q to f, move subtrees to p, free q
      m[f + EN.FLAGS] = m[q + EN.FLAGS];
      m[f + EN.FG] = m[q + EN.FG];
      m[f + EN.BG] = m[q + EN.BG];
      m[p + EN.LEFT + +(m[p + EN.LEFT + 1] === q)] = m[q + EN.LEFT + +(m[q + EN.LEFT + 0] === 0)];
      this.m.free(q << 2);
      this.size--;
      result = 1;
    }
    // update root, color black
    this.root = m[head + EN.LEFT + 1];
    if (this.root) m[this.root + EN.COLOR] = 0;
    return result;
  }
  /**
   * Find node with attributes `flag`, `fg` and `bg`.
   * Returns the node's address or 0 if not found.
   * @param flags
   * @param fg
   * @param bg
   */
  find(flags: number, fg: number, bg: number): number {
    const M = this.m.data;
    let node = this.root;
    while (node) {
      const cmp = this.compare(flags, fg, bg, M[node + EN.FLAGS], M[node + EN.FG], M[node + EN.BG]);
      if (!cmp) return node;
      node = M[node + EN.LEFT + +(cmp === 1)];
    }
    return 0;
  }
  /**
   * Get an ordered iterator for tree nodes.
   * @param reverse iterate in reverse order
   */
  iterator(reverse: boolean = false): AttributeTreeIterator {
    return new AttributeTreeIterator(this, reverse);
  }
}

/**
 * Ordered tree node iterator.
 */
class AttributeTreeIterator {
  private _stack: number[];
  private _load(node: Address): void {
    while (node) {
      this._stack.push(node);
      node = this._tree.m.data[node + EN.LEFT + +this._reverse];
    }
  }
  constructor(private _tree: AttributeTree, private _reverse: boolean = false) {
    this.reset();
  }
  reset(): void {
    this._stack = [];
    this._load(this._tree.root);
  }
  next(): Address {
    const node = this._stack.pop();
    this._load(this._tree.m.data[node + EN.LEFT + +!this._reverse]);
    return node;
  }
  hasNext(): number {
    return this._stack.length;
  }
  toArray(): Address[] {
    const res = [];
    while (this.hasNext()) res.push(this.next());
    return res;
  }
}

/**
 * Flags - bitmask to attributes in `flags`.
 *
 * bits       meaning
 * 1..8       fg for 16 and 256
 * 9..16      bg for 16 and 256
 * 17,18      fg color mode (0: default, 1: 16 palette, 2: 256, 3: RGB)
 * 19,20      bg color mode (0: default, 1: 16 palette, 2: 256, 3: RGB)
 * 21         bold
 * 22         underline
 * 23         blink
 * 24         inverse
 * 25         invisible
 * 26         dim
 * 27         italic
 * 28..31     <unused>
 * 32         pointer distinction for AttributeStorage
 */
export const enum Flags {
  FG = 0xFF,
  BG = 0xFF00,
  FG_MODE = 0x30000,
  BG_MODE = 0xC0000,
  BOLD = 0x100000,
  UNDERLINE = 0x200000,
  BLINK = 0x400000,
  INVERSE = 0x800000,
  INVISIBLE = 0x1000000,
  DIM = 0x2000000,
  ITALIC = 0x4000000,
  UNUSED = 0x78000000,
  POINTER = 0x80000000
}

// foreground color modes
export const enum FGMode {
  DEFAULT = 0,
  P16 = 0x10000,
  P256 = 0x20000,
  RGB = 0x30000
}

// background color modes
export const enum BGMode {
  DEFAULT = 0,
  P16 = 0x40000,
  P256 = 0x80000,
  RGB = 0xC0000
}

enum FGModeName {
  DEFAULT = FGMode.DEFAULT,
  P16 = FGMode.P16,
  P256 = FGMode.P256,
  RGB = FGMode.RGB
}

enum BGModeName {
  DEFAULT = BGMode.DEFAULT,
  P16 = BGMode.P16,
  P256 = BGMode.P256,
  RGB = BGMode.RGB
}

// RGB color channel interface
export interface IColorRGB {
  red: number;
  green: number;
  blue: number;
}

/**
 * Attributes class.
 * Class to hold the terminal cell attributes.
 * Most attributes are held as bitmask values in `Attributes.flags` and
 * can be accesses either through the provided methods or by bitwise operations.
 * The latter typically runs much faster, for time critial code the bitwise
 * access should be preferred (e.g. in the renderer,
 * where those values will be read over and over).
 *
 * Single bit attributes, example with BOLD:
 *    read:   `isBold()`, equivalent to `Attributes.flags & Flags.BOLD`
 *    write:  `setBold(true|false)`
 *
 * Color modes (2 bit mask - 4 values, see `FGMode` and `BGMode`):
 *    read:   `getFGMode()`, equivalent to `Attributes.flags & Flags.FG_MODE`
 *    check specific value: `getFGMode() == FGMode.RGB`
 *    write:  `setFGMode(FGMode.P256)`
 *
 * There are different color modes:
 *  - DEFAULT:  no color meaning at all, just indicates to use the default color
 *              set elsewhere as default color
 *  - P16    :  colors for the 2x 8-color palettes (normal and bright)
 *  - P256   :  256 colors palette, value should be in 0..255
 *  - RGB    :  RGB color, value should be a 4 byte integer as
 *              `red << 16 | green << 8 | blue` with is equivalent to this
 *              byte layout: [ unused | red | green | blue ]
 *              the channel values should be in 0..255
 *
 * Colors:
 *    read:   `getFG()`
 *    write:  `setFG(value)`
 * The way colors are read and written is color mode dependent. It is not possible
 * to set a color for a different color mode than the currently selected. Note that
 * colors are not saved separately for different modes (P16 will overwrite P256),
 * and switching to RGB will delete a palette color that might have been set before.
 * For color mode 'DEFAULT' read always returns 0 and write is a NOOP.
 * For color mode 'P16' and 'P256' the colors are saved along with the single bit
 * attributes in `flags` as 8 bit values. For 'RGB' the 32 bit integer properties
 * `fg` and `bg` are used. To get or set their color channels separately, use the
 * static convenient methods `toRGB` and `fromRGB` to ensure the correct byte layout
 * of the 32 bit numbers.
 */
export class Attributes {
  static toRGB(value: number): IColorRGB {
    return {red: value >>> 16 & 255, green: value >>> 8 & 255, blue: value & 255};
  }
  static fromRGB(value: IColorRGB): number {
    return (value.red & 255) << 16 | (value.green & 255) << 8 | value.blue & 255;
  }
  address: number;
  private _flags: number;
  private _fg: number;
  private _bg: number;
  constructor(public flags: number = 0, public fg: number = 0, public bg: number = 0) {
    this.address = 0;
    this._flags = this.flags;
    this._fg = this.fg;
    this._bg = this.bg;
  }
  updateAddress(): Address {
    if (this._flags ^ this.flags || this._fg ^ this.fg || this._bg ^ this.bg) {
      this.address = 0;
      this._flags = this.flags;
      this._fg = this.fg;
      this._bg = this.bg;
    }
    return this.address;
  }
  getFGMode(): FGMode { return this.flags & Flags.FG_MODE; }
  getBGMode(): BGMode { return this.flags & Flags.BG_MODE; }
  setFGMode(mode: FGMode): void {
    this.flags = this.flags & ~FGMode.RGB | mode;
    // zero fg in flags for RGB to avoid useless nodes in tree
    if (mode == FGMode.RGB) this.flags &= ~Flags.FG;
  }
  setBGMode(mode: BGMode): void {
    this.flags = this.flags & ~BGMode.RGB | mode;
    // zero bg in flags for RGB to avoid useless nodes in tree
    if (mode == BGMode.RGB) this.flags &= ~Flags.BG;
  }
  getFGModeName(): string { return FGModeName[this.flags & Flags.FG_MODE]; }
  getBGModeName(): string { return BGModeName[this.flags & Flags.BG_MODE]; }
  getFG(): number {
    switch (this.flags & Flags.FG_MODE) {
      case FGMode.P16:
      case FGMode.P256:   return this.flags & Flags.FG;
      case FGMode.RGB:    return this.fg;
      default:            return 0;
    }
  }
  getBG(): number {
    switch (this.flags & Flags.BG_MODE) {
      case BGMode.P16:
      case BGMode.P256:   return (this.flags & Flags.BG) >>> 8;
      case BGMode.RGB:    return this.bg;
      default:            return 0;
    }
  }
  setFG(color: number): void {
    switch (this.flags & Flags.FG_MODE) {
      case FGMode.P16:
      case FGMode.P256:
        this.flags = this.flags & ~Flags.FG | color & Flags.FG;
        break;
      case FGMode.RGB:
        this.fg = color;
    }
  }
  setBG(color: number): void {
    switch (this.flags & Flags.BG_MODE) {
      case BGMode.P16:
      case BGMode.P256:
        this.flags = this.flags & ~Flags.BG | color << 8 & Flags.BG;
        break;
      case BGMode.RGB:
        this.bg = color;
    }
  }
  hasRGB(): boolean {
    return (this.flags & Flags.FG_MODE) === FGMode.RGB || (this.flags & Flags.BG_MODE) === BGMode.RGB;
  }
  isBold(): boolean                   { return !!(this.flags & Flags.BOLD); }
  isUnderline(): boolean              { return !!(this.flags & Flags.UNDERLINE); }
  isBlink(): boolean                  { return !!(this.flags & Flags.BLINK); }
  isInverse(): boolean                { return !!(this.flags & Flags.INVERSE); }
  isInvisible(): boolean              { return !!(this.flags & Flags.INVISIBLE); }
  isDim(): boolean                    { return !!(this.flags & Flags.DIM); }
  isItalic(): boolean                 { return !!(this.flags & Flags.ITALIC); }
  setBold(value: boolean): void       { this.flags = this.flags & ~Flags.BOLD | +value * Flags.BOLD; }
  setUnderline(value: boolean): void  { this.flags = this.flags & ~Flags.UNDERLINE | +value * Flags.UNDERLINE; }
  setBlink(value: boolean): void      { this.flags = this.flags & ~Flags.BLINK | +value * Flags.BLINK; }
  setInverse(value: boolean): void    { this.flags = this.flags & ~Flags.INVERSE | +value * Flags.INVERSE; }
  setInvisible(value: boolean): void  { this.flags = this.flags & ~Flags.INVISIBLE | +value * Flags.INVISIBLE; }
  setDim(value: boolean): void        { this.flags = this.flags & ~Flags.DIM | +value * Flags.DIM; }
  setItalic(value: boolean): void     { this.flags = this.flags & ~Flags.ITALIC | +value * Flags.ITALIC; }
}

/**
 * AttributeStorage
 * The attribute storage stores text attributes for terminal cells. It avoids double
 * saving by comparing attributes with already known values and returns an address to the values.
 * To track usage of stored attributes the storage counts the references created by `ref`.
 * The references are meant to be used in the terminal buffers and must be released
 * by calling `unref` when not used anymore, in fact for every single `ref` a `unref` has to follow
 * somewhere in the future or memory will be lost. Once the ref counter drops to zero
 * the memory gets freed.
 * The storage only saves attributes with RGB data in the additional memory.
 * Attributes w'o RGB data are held directly in the returned address.
 *
 * Handling:
 *    InputHandler/Terminal
 *        spawn a global `AttributeStorage`
 *        create a global `Attributes` object (maybe another for defaults)
 *        on SGR change the properties of the object
 *        write address (return value of `AttributeStorage.ref(object)`) to terminal buffer
 *    Renderer
 *        create a renderer global `Attributes` object
 *        on render load attributes with `AttributeStorage.fromAddress(address, object)`
 *        access single attributes via object properties
 *    Buffer
 *        (write address to buffer with `.ref`)
 *        on removing lines/cells - call `unref` for every removed attribute address
 */
export class AttributeStorage {
  m: PoolMemory;
  tree: AttributeTree;
  constructor(initialSlots?: number, maxSlots?: number) {
    this.m = new PoolMemory(CNode.bytes, initialSlots || 16, maxSlots);
    this.tree = new AttributeTree(this.m);
  }
  /**
   * Return the address of the attributes and increment the ref counter.
   * The attribute values can be obtained by `fromAddress`.
   * @param attr
   */
  ref(attr: Attributes): Address {
    if (!attr.updateAddress()) {
      if (attr.hasRGB()) {
        attr.address = this.tree.insert(attr.flags, attr.fg, attr.bg);
        this.m.data[attr.address + EN.REF]++;
        attr.address |= 0x80000000;
      } else attr.address = attr.flags;
    } else if (attr.address & 0x80000000) {
      attr.address &= 0x7FFFFFFF;
      // shortcut to avoid tree insert
      // if we have a positive ref counter and the same attributes
      // we consider the memory location as a valid active treenode
      // otherwise we got a stale address and need to insert again
      if (this.m.data[attr.address + EN.REF]
        && this.m.data[attr.address + EN.FLAGS] === attr.flags
        && this.m.data[attr.address + EN.FG] === attr.fg
        && this.m.data[attr.address + EN.BG] === attr.bg) this.m.data[attr.address + EN.REF]++;
      else {
        attr.address = this.tree.insert(attr.flags, attr.fg, attr.bg);
        this.m.data[attr.address + EN.REF]++;
      }
      attr.address |= 0x80000000;
    }
    return attr.address;
  }
  /**
   * Decrement ref counter. Must be called for every `ref`.
   * @param address
   */
  unref(address: Address): void {
    if (!(address & 0x80000000)) return;
    address &= 0x7FFFFFFF;
    if (this.m.data[address + EN.REF]) {
      if (!--this.m.data[address + EN.REF]) {
        this.tree.remove(this.m.data[address + EN.FLAGS], this.m.data[address + EN.FG], this.m.data[address + EN.BG]);
      }
    }
  }
  /**
   * Load attributes from address.
   * By providing `ref` unnecessary JS object creation and GC can be avoided.
   * Returns the new object or the altered `ref`.
   * @param address
   * @param ref
   */
  fromAddress(address: Address, ref?: Attributes): Attributes {
    ref = ref || new Attributes(address);
    if (address & 0x80000000) {
      const p = address & 0x7FFFFFFF;
      ref.flags = this.m.data[p + EN.FLAGS];
      ref.fg = this.m.data[p + EN.FG];
      ref.bg = this.m.data[p + EN.BG];
    } else {
      ref.flags = address;
      ref.fg = 0;
      ref.bg = 0;
    }
    ref.updateAddress();
    ref.address = address;
    return ref;
  }
  reset(): void {
    this.m.clear();
    this.tree = new AttributeTree(this.m);
  }
}
