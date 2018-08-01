/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

// buffer structure
/**
 * char data: max unicode 0x10ffff --> 21 bits taken, 11 free
 * 
 * what we need:
 *    - flags currently 7, 3 more to come --> 10 bits
 *    - colors:
 *        - monochrome    0 bits
 *        - 16 colors     10 bits (8 + 2) // +2 to indicate default vs. color set
 *        - 256 colors    18 bits (2 * 8 + 2)
 *        - RGB           52 bits (2 * 24 + 2 + 2) // +2 to indicate RGB is set
 *    - address space to feed at least 10000 rows * 1000 cells with strings and colors --> ~2^24
 * 
 * buffer layout:
 *    char content                     color attr
 *    int32_t                          int32_t
 *    00000000000000000000000000000000 00000000000000000000000000000000
 *    00000000000100001111111111111111 00000000000000001111111111111111  taken by unicode char + 256 BG/FG
 *    10000000000000000000000000000000 10000000000000000000000000000000  taken by pointer indicator
 *    10000000XXXXXXXXXXXXXXXXXXXXXXXX 10000000YYYYYYYYYYYYYYYYYYYYYYYY  at least 2^24 (16M) address space
 *    --> 0: 14 bits free for flags
 *    --> X: points to combined char content string (StringStorage)
 *    --> Y: points to RGB colors settings (AttributeStorage)
 * 
 * AttributeStorage (RGB):
 *    FG                               BG
 *    uint32_t                         uint32_t
 * 
 * 
 */

const enum AttributeEntry {
  FG = 0,
  BG = 1
}

export const enum FLAGS {
  BOLD = 1,
  UNDERLINE = 2,
  BLINK = 4,
  INVERSE = 8,
  INVISIBLE = 16,
  DIM = 32,
  ITALIC = 64
}

export interface IColorsRef {
  indexed: number;
  R: number;
  G: number;
  B: number;
}

interface ITextAttributes {
  bold: number;
  underline: number;
  blink: number;
  inverse: number;
  invisible: number;
  dim: number;
  italic: number;
  fgRGB: number;
  bgRGB: number;
  fgRef: IColorsRef;
  bgRef: IColorsRef;
  flags: number;
  fg: number;
  bg: number;
  updateColors(fg: number, bg: number): void;
}

export class TextAttributes implements ITextAttributes {
  private _fgRef: IColorsRef;
  private _bgRef: IColorsRef;
  constructor(public flags: number, public fg: number, public bg: number) {
    this._fgRef = {R: 0, G: 0, B: 0, indexed: 0};
    this._getColors(this.fg, this._fgRef, this.fgRGB);
    this._bgRef = {R: 0, G: 0, B: 0, indexed: 0};
    this._getColors(this.bg, this._bgRef, this.bgRGB);
  }
  updateColors(fg: number, bg: number): void {
    this.fg = fg;
    this._getColors(this.fg, this._fgRef, this.fgRGB);
    this.bg = bg;
    this._getColors(this.bg, this._bgRef, this.bgRGB);
  }
  get fgRGB(): number {
    return this.fg & 0x80000000;
  }
  set fgRGB(value: number) {
    if (value) this.fg | 0x80000000;
    else this.fg &= ~0x80000000;
  }
  get bgRGB(): number {
    return this.bg & 0x80000000;
  }
  set bgRGB(value: number) {
    if (value) this.bg | 0x80000000;
    else this.bg &= ~0x80000000;
  }
  private _getColors(value: number, colors: IColorsRef, isRGB: number): void {
    if (isRGB) {
      colors.R = (value >> 16) & 0xFF;
      colors.G = (value >> 8) & 0xFF;
      colors.B = value & 255;
      colors.indexed = 0;
    } else {
      colors.R = 0;
      colors.G = 0;
      colors.B = 0;
      colors.indexed = value & 255;
    }
  }
  private _setColors(colors: IColorsRef, isRGB: number): number {
    if (isRGB) return (colors.R << 16) | (colors.G << 8) | colors.B | 0x80000000;
    return colors.indexed & 255;
  }
  get fgRef(): IColorsRef {
    return this._fgRef;
  }
  set fgRef(colors: IColorsRef) {
    this.fg = this._setColors(colors, this.fgRGB);
    this._getColors(this.fg, this._fgRef, this.fgRGB);
  }
  get bgRef(): IColorsRef {
    return this._bgRef;
  }
  set bgRef(colors: IColorsRef) {
    this.bg = this._setColors(colors, this.bgRGB);
    this._getColors(this.bg, this._bgRef, this.bgRGB);
  }
  get bold(): number {
    return this.flags & FLAGS.BOLD;
  }
  set bold(value: number) {
    if (value) this.flags |= FLAGS.BOLD;
    else this.flags &= ~FLAGS.BOLD;
  }
  get underline(): number {
    return this.flags & FLAGS.UNDERLINE;
  }
  set underline(value: number) {
    if (value) this.flags |= FLAGS.UNDERLINE;
    else this.flags &= ~FLAGS.UNDERLINE;
  }
  get blink(): number {
    return this.flags & FLAGS.BLINK;
  }
  set blink(value: number) {
    if (value) this.flags |= FLAGS.BLINK;
    else this.flags &= ~FLAGS.BLINK;
  }
  get inverse(): number {
    return this.flags & FLAGS.INVERSE;
  }
  set inverse(value: number) {
    if (value) this.flags |= FLAGS.INVERSE;
    else this.flags &= ~FLAGS.INVERSE;
  }
  get invisible(): number {
    return this.flags & FLAGS.INVISIBLE;
  }
  set invisible(value: number) {
    if (value) this.flags |= FLAGS.INVISIBLE;
    else this.flags &= ~FLAGS.INVISIBLE;
  }
  get dim(): number {
    return this.flags & FLAGS.DIM;
  }
  set dim(value: number) {
    if (value) this.flags |= FLAGS.DIM;
    else this.flags &= ~FLAGS.DIM;
  }
  get italic(): number {
    return this.flags & FLAGS.ITALIC;
  }
  set italic(value: number) {
    if (value) this.flags |= FLAGS.ITALIC;
    else this.flags &= ~FLAGS.ITALIC;
  }
}

export class AttributeStorage {
  public data: Uint32Array;
  public refs: Uint32Array;
  constructor(initial: number) {
    this.data = new Uint32Array(initial * 2);
    this.refs = new Uint32Array(initial);
  }
  private _getSlot(attrs: ITextAttributes): number {
    // search in O(n) :(
    for (let i = 0; i < this.refs.length; i++) {
      if (!this.refs[i]) {
        this.data[i * 2 + AttributeEntry.FG] = attrs.fg;
        this.data[i * 2 + AttributeEntry.BG] = attrs.bg;
        return i;
      }
      if (this.data[i * 2 + AttributeEntry.FG] === attrs.fg
          && this.data[i * 2 + AttributeEntry.BG] === attrs.bg) return i;
    }
    // mem exhausted - resize
    const idx = this.refs.length;
    const data = new Uint32Array(this.data.length * 2);
    for (let i = 0; i < this.data.length; ++i) data[i] = this.data[i];
    this.data = data;
    const refs = new Uint32Array(this.refs.length * 2);
    for (let i = 0; i < this.refs.length; ++i) refs[i] = this.refs[i];
    this.refs = refs;
    return idx;
  }
  ref(slot: number): void {
    if (slot < 0) this.refs[slot & 0xFFFFFF]++;
  }
  unref(slot: number): void {
    if (slot < 0 && this.refs[slot & 0xFFFFFF]) this.refs[slot & 0xFFFFFF]--;
  }
  loadAttrs(slot: number, attrs: ITextAttributes): void {
    if (slot < 0) {
      attrs.flags = slot >> 24 & 7;
      const idx = slot << 1 & 0xFFFFFF;
      attrs.updateColors(this.data[idx + AttributeEntry.FG], this.data[idx + AttributeEntry.BG]);
    } else {
      attrs.flags = slot >> 24;
      attrs.updateColors(slot >> 16 & 0xFF, slot >> 8 & 0xFF);
    }
  }
  storeAttrs(attrs: ITextAttributes): number {
    if (attrs.fgRGB || attrs.bgRGB) {
      const idx = this._getSlot(attrs);
      return idx | attrs.flags << 24 | 2147483648;
    }
    return attrs.flags << 24 | attrs.fg << 16 | attrs.bg << 8;
  }
}


const ENTRY_SIZE = 3;

export class RefPoolAllocator {
  public data: Uint32Array;
  public head: number;
  constructor() {
    this.data = new Uint32Array(ENTRY_SIZE * 16);
    for (let i = ENTRY_SIZE; i < this.data.length; i += ENTRY_SIZE) {
      this.data[i] = i + ENTRY_SIZE;
    }
    this.data[this.data.length - ENTRY_SIZE] = 0;
    this.head = ENTRY_SIZE;
  }
  alloc(): number {
    const idx = this.head;
    if (!idx) {
      console.log('out of memory');
      return 0;
    }
    this.head = this.data[this.head];
    return idx;
  }
  free(idx: number) {
    this.data[idx] = this.head;
    this.head = idx;
  }
  store(fg: number, bg: number) {

  }
  load(idx: number) {}
}

const mem = new RefPoolAllocator();
for (let i=0; i < 16; ++i) console.log(mem.alloc());


export interface Type {
  size: number;
}

export class Memory {
  public heap: ArrayBuffer;
  readonly HEAP8: Uint8Array;
  readonly HEAP16: Uint16Array;
  readonly HEAP32: Uint32Array;
  constructor() {
    this.heap = new ArrayBuffer(8);
    this.HEAP8 = new Uint8Array(this.heap);
    this.HEAP16 = new Uint16Array(this.heap);
    this.HEAP32 = new Uint32Array(this.heap);
  }
}





export interface IMemory {
  memory: Uint8Array | Uint16Array | Uint32Array;
  alloc(size: number): number;
  free(idx: number): void;
}


export class Stack {
  public stack: ArrayBuffer;
  public STACK8: Uint8Array;
  public STACK16: Uint16Array;
  public STACK32: Uint32Array;
  public SP: number;
  constructor(initial: number) {
    this.stack = new ArrayBuffer(initial);
    this.STACK8 = new Uint8Array(this.stack);
    this.STACK16 = new Uint16Array(this.stack);
    this.STACK32 = new Uint32Array(this.stack);
    this.SP = 4;
  }
  alloc8(size: number): number {
    const idx = this.SP;
    this.SP += (size & 3) ? ((size >> 2) + 1) << 2 : size;
    return idx;
  }
  resetSP(sp: number) {
    this.SP = sp;
  }
  alloc16(size: number): number {
    return this.alloc8(size << 1) >> 1;
  }
  alloc32(size: number): number {
    return this.alloc8(size << 2) >> 2;
  }
}

export class StackImpl implements IMemory {
  public memory: Uint8Array;
  public alloc: (size: number) => number;
  public free: (idx: number) => void;
  constructor(protected _stack: Stack) {
    this.free = this._stack.resetSP.bind(this._stack);
  }
  getSP(): number {
    return this._stack.SP;
  }
}

export class Stack8 extends StackImpl {
  constructor(_stack: Stack) {
    super(_stack);
    this.memory = this._stack.STACK8;
    this.alloc = this._stack.alloc8.bind(this._stack);
  }
}

export class Stack16 extends StackImpl {
  constructor(_stack: Stack) {
    super(_stack);
    this.memory = this._stack.STACK16;
    this.alloc = this._stack.alloc16.bind(this._stack);
  }
}

export class Stack32 extends StackImpl {
  constructor(_stack: Stack) {
    super(_stack);
    this.memory = this._stack.STACK32;
    this.alloc = this._stack.alloc32.bind(this._stack);
  }
}

export class Integer {
  static load(mem: IMemory, pointer: number): number {
    return mem.memory[pointer];
  }
  static store(mem: IMemory, pointer: number, value: number) {
    mem.memory[pointer] = value;
  }
  static create(mem: IMemory, value: number): number {
    const pointer = mem.alloc(1);
    Integer.store(mem, pointer, value);
    return pointer;
  }
}

export class CString {
  static load(mem: IMemory, pointer: number): string {
    let s = '';
    while (mem.memory[pointer]) s += String.fromCharCode(mem.memory[pointer++]);
    return s;
  }
  static store(mem: IMemory, pointer: number, value: string) {
    for (let i = 0, j = pointer; i < value.length; ++i, ++j) mem.memory[j] = value.charCodeAt(i);
    mem.memory[pointer + value.length] = 0;
  }
  static create(mem: IMemory, value: string): number {
    const pointer = mem.alloc(value.length + 1);
    CString.store(mem, pointer, value);
    return pointer;
  }
  static alloc(mem: IMemory, value: number): number {
    return mem.alloc(value);
  }
}

export interface Struct {
  s: CString;
  b: Integer;
}

/*
const stack = new Stack(64);
const s8 = new Stack8(stack);
const s16 = new Stack16(stack);
const s32 = new Stack32(stack);

const sp = s8.getSP();
const p1 = CString.create(s8, 'Hello World!');
console.log(CString.load(s8, p1), p1);
const p2 = CString.create(s8, 'Hier kommt die Maus!');
console.log(CString.load(s8, p2), p2);
s8.free(sp);
const p3 = CString.create(s8, 'Waldbr€nd!');
console.log(CString.load(s8, p3), p3);
const p4 = CString.create(s16, 'Waldbr€nd!');
console.log(CString.load(s16, p4), p4);
console.log(stack.STACK8);
*/

export class PoolAllocator {
  public heap: ArrayBuffer;
  public HEAP8: Uint8Array;
  public HEAP16: Uint16Array;
  public HEAP32: Uint32Array;
  public entrySize: number;
  public head: number;
  public numSlots: number;
  constructor(public initialSlots: number, public maxSlots: number, public slotSize: number) {    
    // adjust slotSize to multiple of 4 (must be at least 4 bytes to hold list address)
    this.entrySize = (slotSize & 3) ? ((slotSize >> 2) + 1) << 2 : slotSize;

    // check for address overflow
    if ((initialSlots + 1) * this.entrySize > 0xFFFFFFFF) throw new Error('initial address space exceeds 2^32');
    if ((maxSlots + 1) * this.entrySize > 0xFFFFFFFF) throw new Error('max address space exceeds 2^32');

    // create storage, reserve first slot as NULL
    this.heap = new ArrayBuffer(this.entrySize * (this.initialSlots + 1));
    this.HEAP8 = new Uint8Array(this.heap);
    this.HEAP16 = new Uint16Array(this.heap);
    this.HEAP32 = new Uint32Array(this.heap);

    // insert free list HEAP8 based pointers into HEAP32
    // last slot gets NULL pointer
    // head points to first slot at entrySize
    for (let i = this.entrySize; i < this.HEAP8.length; i += this.entrySize) this.HEAP32[i >> 2] = i + this.entrySize;
    this.HEAP32[(this.HEAP8.length - this.entrySize) >> 2] = 0;
    this.head = this.entrySize;
    this.numSlots = this.initialSlots;
  }
  alloc(): number {
    if (!this.head) {
      // out of memory, try to resize
      let newSlots = this.numSlots * 2;
      if (newSlots > this.maxSlots) newSlots = this.maxSlots;
      if (newSlots === this.numSlots) throw new Error('out of memory');

      // alloc new storage and copy values over
      const heap = new ArrayBuffer(this.entrySize * (newSlots + 1));
      const HEAP8 = new Uint8Array(heap);
      const HEAP16 = new Uint16Array(heap);
      const HEAP32 = new Uint32Array(heap);
      for (let i = 0; i < this.HEAP32.length; ++i) HEAP32[i] = this.HEAP32[i];
      HEAP32[(HEAP8.length - this.entrySize) >> 2] = 0;
      for (let i = this.HEAP8.length; i < HEAP8.length; i += this.entrySize) HEAP32[i >> 2] = i + this.entrySize;
      HEAP32[(HEAP8.length - this.entrySize) >> 2] = 0;
      this.head = this.HEAP8.length;
      this.numSlots = newSlots;
      this.heap = heap;
      this.HEAP8 = HEAP8;
      this.HEAP16 = HEAP16;
      this.HEAP32 = HEAP32;
    }
    const idx = this.head;
    this.head = this.HEAP32[this.head >> 2];
    return idx;
  }
  free(idx: number) {
    this.HEAP32[idx >> 2] = this.head;
    this.head = idx;
  }
}

export class PoolAllocatorU32 {
  public HEAP: Uint32Array;
  public entrySize: number;
  public head: number;
  public numSlots: number;
  constructor(public initialSlots: number, public maxSlots: number, public slotSize: number) {    
    // adjust slotSize to multiple of 4 (must be at least 4 bytes to hold list address)
    this.entrySize = slotSize;

    // check for address overflow
    if ((initialSlots + 1) * this.entrySize > 0xFFFFFFFF) throw new Error('initial address space exceeds 2^32');
    if ((maxSlots + 1) * this.entrySize > 0xFFFFFFFF) throw new Error('max address space exceeds 2^32');

    // create storage, reserve first slot as NULL
    this.HEAP = new Uint32Array(this.entrySize * (this.initialSlots + 1));

    // insert free list pointers
    // last slot gets NULL pointer
    // head points to first slot at entrySize
    for (let i = this.entrySize; i < this.HEAP.length; i += this.entrySize) this.HEAP[i] = i + this.entrySize;
    this.HEAP[this.HEAP.length - this.entrySize] = 0;
    this.head = this.entrySize;
    this.numSlots = this.initialSlots;
  }
  alloc(): number {
    if (!this.head) {
      // out of memory, try to resize
      let newSlots = this.numSlots * 2;
      if (newSlots > this.maxSlots) newSlots = this.maxSlots;
      if (newSlots === this.numSlots) throw new Error('out of memory');

      // alloc new storage and copy values over
      const HEAP = new Uint32Array(this.entrySize * (newSlots + 1));
      for (let i = 0; i < this.HEAP.length; ++i) HEAP[i] = this.HEAP[i];
      HEAP[HEAP.length - this.entrySize] = 0;
      for (let i = this.HEAP.length; i < HEAP.length; i += this.entrySize) HEAP[i] = i + this.entrySize;
      HEAP[HEAP.length - this.entrySize] = 0;
      this.head = this.HEAP.length;
      this.numSlots = newSlots;
      this.HEAP = HEAP;
    }
    const idx = this.head;
    this.head = this.HEAP[idx];
    return idx;
  }
  free(idx: number) {
    this.HEAP[idx] = this.head;
    this.head = idx;
  }
}

const A = [
  0, 9, 1, 10, 13, 21, 2, 29, 11, 14, 16, 18, 22, 25, 3, 30,
  8, 12, 20, 28, 15, 17, 24, 7, 19, 27, 23, 6, 26, 5, 4, 31
];
function msbDeBruijn(v: number) {
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return A[(32 + ((v * 0x07C4ACDD) >> 27)) & 31];
}

console.log('pa:');
const pa = new PoolAllocator(2, 5, 4);
for (let i = 0; i < 5; ++i) {
  const p = pa.alloc();
  console.log(p);
  pa.HEAP8[p] = i;
}
console.log(pa);


/**
 * AtributeEntry as double linked list
 */
export interface AttributeEntryNew {
  prev: number;
  next: number;
  ref: number;
  fg: number;
  bg: number;
}


// LLRB
export interface INode {
  key: number;
  value: number;
  red: number;
  left: PNode;
  right: PNode;
}
const enum ENode {
  KEY = 0,
  VALUE = 1,
  RED = 2,
  LEFT = 3,
  RIGHT = 4
}

type PNode = number;
const nullptr = 0;

export class LLRB {
  //public memory: PoolAllocator;
  public memory: PoolAllocatorU32;
  public M: Uint32Array;
  public root: PNode;
  public bottom: PNode;
  public alloc: () => PNode;
  constructor(initialSlots: number, maxSlots: number) {
    //this.memory = new PoolAllocator(initialSlots, maxSlots, 20);
    //this.M = this.memory.HEAP32;
    this.memory = new PoolAllocatorU32(initialSlots, maxSlots, 5);
    this.M = this.memory.HEAP;
    this.alloc = this.memory.alloc.bind(this.memory);
    this.bottom = nullptr;
    this.root = this.bottom;
  }
  //alloc() {
  //  return this.memory.alloc() >> 2;
  //}
  compare(a: number, b: number): number {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  find(key: number): PNode {
    const M = this.M;
    let n = this.root;
    while (n !== this.bottom) {
      let c = this.compare(key, M[n + ENode.KEY]);
      if (c === 0) return n;
      n = c < 0 ? M[n + ENode.LEFT] : M[n + ENode.RIGHT];
    }
    return nullptr;
  }
  insert(key: number, value: number) {
    this.root = this._insert(this.root, key, value, this.M);
    this.M[this.root + ENode.RED] = 0;
  }
  removeMin() {
    if (this.root === this.bottom) return;
    const M = this.M;
    const root_left = M[this.root + ENode.LEFT];
    const root_right = M[this.root + ENode.RIGHT];
    if (!M[root_left + ENode.RED] && !M[root_right + ENode.RED]) M[this.root + ENode.RED] = 1;
    this.root = this._removeMin(this.root, M);
    M[this.root + ENode.RED] = 0;
  }
  remove(key: number) {
    if (!this.find(key)) return;
    const M = this.M;
    if (!M[M[this.root + ENode.LEFT] + ENode.RED] && !M[M[this.root + ENode.RIGHT] + ENode.RED]) M[this.root + ENode.RED] = 1;
    this.root = this._remove(this.root, key, M);
    M[this.root + ENode.RED] = 0;
  }
  private _insert(h: PNode, key: number, value: number, M: Uint32Array): PNode {
    if (h === this.bottom) {
      const idx = this.alloc();
      this.M = this.memory.HEAP;
      M = this.M;
      M[idx + ENode.KEY] = key;
      M[idx + ENode.VALUE] = value;
      M[idx + ENode.RED] = 1;
      M[idx + ENode.LEFT] = this.bottom;
      M[idx + ENode.RIGHT] = this.bottom;
      return idx;
    }
    const c = this.compare(key, M[h + ENode.KEY]);
    if (c < 0) this.M[h + ENode.LEFT] = this._insert(M[h + ENode.LEFT], key, value, M);
    else if (c > 0) this.M[h + ENode.RIGHT] = this._insert(M[h + ENode.RIGHT], key, value, M);
    else this.M[h + ENode.VALUE] = value;
    M = this.M;
    if (M[M[h + ENode.RIGHT] + ENode.RED] && !M[M[h + ENode.LEFT] + ENode.RED]) h = this._rotateLeft(h, M);
    if (M[M[h + ENode.LEFT] + ENode.RED] && M[M[M[h + ENode.LEFT] + ENode.LEFT] + ENode.RED]) h = this._rotateRight(h, M);
    if (M[M[h + ENode.LEFT] + ENode.RED] && M[M[h + ENode.RIGHT] + ENode.RED]) this._flipColors(h, M);
    return h;
  }
  private _remove(h: PNode, key: number, M: Uint32Array) {
    if (this.compare(key, M[h + ENode.KEY]) < 0)  {
      const left = M[h + ENode.LEFT];
      if (!M[left + ENode.RED] && !M[M[left + ENode.LEFT] + ENode.RED]) h = this._moveRedLeft(h, M);
      M[h + ENode.LEFT] = this._remove(M[h + ENode.LEFT], key, M);
    } else {
      if (M[M[h + ENode.LEFT] + ENode.RED]) h = this._rotateRight(h, M);
      if (this.compare(key, M[h + ENode.KEY]) === 0 && (M[h + ENode.RIGHT] === this.bottom)) return this.bottom;
      const right = M[h + ENode.RIGHT];
      if (!M[right + ENode.RED] && !M[M[right + ENode.LEFT] + ENode.RED]) h = this._moveRedRight(h, M);
      if (this.compare(key, M[h + ENode.KEY]) === 0) {
        const x = this._min(M[h + ENode.RIGHT], M);
        M[h + ENode.KEY] = M[x + ENode.KEY];
        M[h + ENode.VALUE] = M[x + ENode.VALUE];
        M[h + ENode.RIGHT] = this._removeMin(M[h + ENode.RIGHT], M);
      } else M[h + ENode.RIGHT] = this._remove(M[h + ENode.RIGHT], key, M);
    }
    return this._balance(h, M);
  }
  private _min(h: PNode, M: Uint32Array): PNode {
    if (M[h + ENode.LEFT] === this.bottom) return h;
    return this._min(M[h + ENode.LEFT], M);
  }
  private _removeMin(h: PNode, M: Uint32Array) {
    const left = M[h + ENode.LEFT];
    if (left === this.bottom) return this.bottom;
    if (!M[left + ENode.RED] && !M[M[left + ENode.LEFT] + ENode.RED]) h = this._moveRedLeft(h, M);
    M[h + ENode.LEFT] = this._removeMin(left, M);
    return this._balance(h, M);
  }
  private _balance(h: PNode, M: Uint32Array) {
    if (M[M[h + ENode.RIGHT] + ENode.RED]) h = this._rotateLeft(h, M);
    const left = M[h + ENode.LEFT];
    if (M[left + ENode.RED] && M[M[left + ENode.LEFT] + ENode.RED]) h = this._rotateRight(h, M);
    if (M[M[h + ENode.LEFT] + ENode.RED] && M[M[h + ENode.RIGHT] + ENode.RED]) this._flipColors(h, M);
    return h;
  }
  private _moveRedLeft(h: PNode, M: Uint32Array) {
    this._flipColors(h, M);
    const right = M[h + ENode.RIGHT];
    if (M[M[right + ENode.LEFT] + ENode.RED]) {
        M[h + ENode.RIGHT] = this._rotateRight(right, M);
        h = this._rotateLeft(h, M);
    }
    return h;
  }
  private _moveRedRight(h: PNode, M: Uint32Array) {
    this._flipColors(h, M);
    if (M[M[M[h + ENode.LEFT] + ENode.LEFT] + ENode.RED]) h = this._rotateRight(h, M);
    return h;
  }
  private _rotateRight(h: PNode, M: Uint32Array) {
    const x = M[h + ENode.LEFT];
    M[h + ENode.LEFT] = M[x + ENode.RIGHT];
    M[x + ENode.RIGHT] = h;
    M[x + ENode.RED] = M[h + ENode.RED];
    M[h + ENode.RED] = 1;
    return x;
  }
  private _rotateLeft(h: PNode, M: Uint32Array) {
    const x = M[h + ENode.RIGHT];
    M[h + ENode.RIGHT] = M[x + ENode.LEFT];
    M[x + ENode.LEFT] = h;
    M[x + ENode.RED] = M[h + ENode.RED];
    M[h + ENode.RED] = 1;
    return x;
  }
  private _flipColors(h: PNode, M: Uint32Array) {
    M[h + ENode.RED] ^= 1;
    M[M[h + ENode.LEFT] + ENode.RED] ^= 1;
    M[M[h + ENode.RIGHT] + ENode.RED] ^= 1;
  }
}

export class LLRBIterator {
  private _stack: number[];
  constructor(private _llrb: LLRB, private _reverse=false) {
    this._stack = [];
    this._load(this._llrb.root, (this._reverse) ? ENode.RIGHT : ENode.LEFT);
  }
  private _load(node: PNode, direction: ENode) {
    while (node) {
      this._stack.push(node);
      node = this._llrb.M[node + direction];
    }
  }
  next(): PNode {
    const node = this._stack.pop();
    if (this._reverse) this._load(this._llrb.M[node + ENode.LEFT], ENode.RIGHT);
    else this._load(this._llrb.M[node + ENode.RIGHT], ENode.LEFT);
    return node;
  }
  hasNext(): boolean {
    return !!this._stack.length;
  }
  toArray(): PNode[] {
    const res = [];
    while (this.hasNext()) res.push(this.next());
    return res;
  }
}

console.log('LLRB stuff');
const llrb__ = new LLRB(10, 1000);
for (let i = 3; i >= 0; --i) llrb__.insert(i, i*2);
console.log(llrb__);
console.log(llrb__.find(4));
console.log(llrb__.find(5));
console.log(llrb__.find(6));
console.log(new LLRBIterator(llrb__, false).toArray().map((el) => llrb__.M[el + ENode.KEY]));
console.log(new LLRBIterator(llrb__, true).toArray().map((el) => llrb__.M[el + ENode.KEY]));



function test(n: number, scale: number) {
  let sum = [0, 0];
  for (let k = 0; k < scale; ++k) {
    const llrb = new LLRB(1, 20000000);
    for (let i = 0; i < n; ++i) llrb.insert(n, n);
    const start = process.hrtime();
    for (let i = n; i < n+10000; ++i) llrb.insert(Math.random() * Math.pow(2, 24) >>> 0, 0);
    const end = process.hrtime(start);
    sum[0] += end[0];
    sum[1] += end[1];
  }
  return [sum[0], sum[1]/1000000];
}


for (let i = 0; i < 5; ++i) console.log('100,', test(100, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('250,', test(100, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('500,', test(100, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('750,', test(100, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('1000,', test(1000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('2500,', test(1000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('5000,', test(1000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('7500,', test(1000, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('10000,', test(10000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('25000,', test(10000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('50000,', test(10000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('75000,', test(10000, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('100000,', test(100000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('250000,', test(100000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('500000,', test(100000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('750000,', test(100000, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('1000000,', test(1000000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('2500000,', test(1000000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('5000000,', test(1000000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('7500000,', test(1000000, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('10000000,', test(10000000, 100)[1]);


function test2(n: number, scale: number) {
  let sum = [0, 0];
  const attr = new TextAttributes(0, 0, 0);
  for (let k = 0; k < scale; ++k) {
    const stor = new AttributeStorage(1);
    for (let i = 0; i < n; ++i) {
      attr.fg = i;
      let p = stor.storeAttrs(attr);
      stor.ref(p);
    }
    const start = process.hrtime();
    for (let i = n; i < n+10000; ++i) {
      //attr.fg = i;
      attr.fg = Math.random() * Math.pow(2, 24) >>> 0;
      let p = stor.storeAttrs(attr);
      stor.ref(p);
    }
    const end = process.hrtime(start);
    sum[0] += end[0];
    sum[1] += end[1];
  }
  return [sum[0], sum[1]/1000000];
}


for (let i = 0; i < 5; ++i) console.log('100,', test2(100, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('250,', test2(100, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('500,', test2(100, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('750,', test2(100, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('1000,', test2(1000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('2500,', test2(1000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('5000,', test2(1000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('7500,', test2(1000, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('10000,', test2(10000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('25000,', test2(10000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('50000,', test2(10000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('75000,', test2(10000, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('100000,', test2(100000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('250000,', test2(100000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('500000,', test2(100000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('750000,', test2(100000, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('1000000,', test2(1000000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('2500000,', test2(1000000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('5000000,', test2(1000000, 100)[1]);
//for (let i = 0; i < 5; ++i) console.log('7500000,', test2(1000000, 100)[1]);
for (let i = 0; i < 5; ++i) console.log('10000000,', test2(10000000, 100)[1]);


// taken from https://github.com/mourner/bbtree
/*
'use strict';

module.exports = llrb;

function llrb(compare) {
    return new LLRBTree(compare);
}


function Node(key, value, red, left, right) {
    this.key = key;
    this.value = value;
    this.red = red;
    this.left = left;
    this.right = right;
}

var bottom = new Node(null, null, false);
bottom.left = bottom;
bottom.right = bottom;


function LLRBTree(compare) {
    this.compare = compare || defaultCompare;
    this.root = bottom;
}

LLRBTree.prototype = {

    find: function (key) {
        var n = this.root,
            cmp = this.compare;

        while (n !== bottom) {
            var c = cmp(key, n.key);
            if (c === 0) return n;
            n = c < 0 ? n.left : n.right;
        }
        return null;
    },

    insert: function (key, value) {
        this.root = insert(this.root, key, value, this.compare);
        this.root.red = false;
    },

    removeMin: function () {
        var root = this.root;

        if (root === bottom) return;
        if (!root.left.red && !root.right.red) root.red = true;

        root = this.root = removeMin(root);
        root.red = false;
    },

    remove: function (key) {
        if (!this.find(key)) return;

        var root = this.root;

        if (!root.left.red && !root.right.red) root.red = true;

        root = this.root = remove(root, key, this.compare);
        root.red = false;
    }
};

function defaultCompare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

function insert(h, key, value, compare) {
    if (h === bottom) return new Node(key, value, true, bottom, bottom);

    var c = compare(key, h.key);

    if (c < 0) h.left = insert(h.left, key, value, compare);
    else if (c > 0) h.right = insert(h.right, key, value, compare);
    else h.value = value;

    if (h.right.red && !h.left.red) h = rotateLeft(h);
    if (h.left.red && h.left.left.red) h = rotateRight(h);
    if (h.left.red && h.right.red) flipColors(h);

    return h;
}

function removeMin(h) {
    if (h.left === bottom) return bottom;
    if (!h.left.red && !h.left.left.red) h = moveRedLeft(h);
    h.left = removeMin(h.left);
    return balance(h);
}

function remove(h, key, compare) {
    if (compare(key, h.key) < 0)  {
        if (!h.left.red && !h.left.left.red) h = moveRedLeft(h);
        h.left = remove(h.left, key, compare);

    } else {
        if (h.left.red) h = rotateRight(h);

        if (compare(key, h.key) === 0 && (h.right === bottom)) return bottom;

        if (!h.right.red && !h.right.left.red) h = moveRedRight(h);

        if (compare(key, h.key) === 0) {
            var x = min(h.right);
            h.key = x.key;
            h.val = x.val;
            h.right = removeMin(h.right);

        } else h.right = remove(h.right, key, compare);
    }
    return balance(h);
}

function min(x) {
    if (x.left === bottom) return x;
    else return min(x.left);
}

function rotateRight(h) {
    var x = h.left;
    h.left = x.right;
    x.right = h;
    x.red = h.red;
    h.red = true;
    return x;
}

function rotateLeft(h) {
    var x = h.right;
    h.right = x.left;
    x.left = h;
    x.red = h.red;
    h.red = true;
    return x;
}

function flipColors(h) {
    h.red = !h.red;
    h.left.red = !h.left.red;
    h.right.red = !h.right.red;
}

function moveRedLeft(h) {
    flipColors(h);
    if (h.right.left.red) {
        h.right = rotateRight(h.right);
        h = rotateLeft(h);
    }
    return h;
}

function moveRedRight(h) {
    flipColors(h);
    if (h.left.left.red) h = rotateRight(h);
    return h;
}

function balance(h) {
    if (h.right.red) h = rotateLeft(h);
    if (h.left.red && h.left.left.red) h = rotateRight(h);
    if (h.left.red && h.right.red) flipColors(h);
    return h;
}
*/
