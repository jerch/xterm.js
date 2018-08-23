/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { CNode, AttributeTree, Attributes, FGMode, BGMode, AttributeStorage, Flags } from './AttributeStorage';
import * as chai from 'chai';
import { PoolMemory, Address } from './Memory';

const enum EN {
  COLOR = 0,
  LEFT = 1,
  RIGHT = 2,
  FLAGS = 3,
  FG = 4,
  BG = 5,
  REF = 6
}

function treeAssert(tree: AttributeTree, root: Address): number {
  let lh;
  let rh;
  if (!root) return 1;
  const M = tree.m.data;
  const ln = M[root + EN.LEFT + 0];
  const rn = M[root + EN.LEFT + 1];
  // Consecutive red links
  if (M[root + EN.COLOR]) {
    if (ln && M[ln + EN.COLOR] && rn && M[rn + EN.COLOR]) {
      throw new Error('red violation');
    }
  }
  lh = treeAssert(tree, ln);
  rh = treeAssert(tree, rn);
  // Invalid binary search tree
  if ((ln && tree.compare(M[ln + EN.FLAGS], M[ln + EN.FG], M[ln + EN.BG],
                          M[root + EN.FLAGS], M[root + EN.FG], M[root + EN.BG]) >= 0)
    || (rn && tree.compare(M[rn + EN.FLAGS], M[rn + EN.FG], M[rn + EN.BG],
                           M[root + EN.FLAGS], M[root + EN.FG], M[root + EN.BG]) <= 0)) {
    throw new Error('binary tree violation');
  }
  // black height mismatch
  if (lh && rh && lh !== rh) {
    throw new Error('black violation');
  }
  // only count black links
  if (lh && rh) return (M[root + EN.COLOR]) ? lh : lh + 1;
  return 0;
}

describe('RBTree', function(): void {
  it('conformance to CNode alignment', function(): void {
    const alignments = CNode.alignments;
    chai.expect(EN.COLOR << 2).equals(alignments['color'][0]);
    chai.expect(EN.LEFT << 2).equals(alignments['left'][0]);
    chai.expect(EN.RIGHT << 2).equals(alignments['right'][0]);
    chai.expect(EN.FLAGS << 2).equals(alignments['flags'][0]);
    chai.expect(EN.FG << 2).equals(alignments['fg'][0]);
    chai.expect(EN.BG << 2).equals(alignments['bg'][0]);
    chai.expect(EN.REF << 2).equals(alignments['ref'][0]);
  });
  it('insert & find', function(): void {
    const memory = new PoolMemory(CNode.bytes, 10);
    const tree = new AttributeTree(memory);
    chai.expect(tree.size).equals(0);
    const p1 = tree.insert(1, 2, 3);
    const p2 = tree.insert(1, 2, 3);
    const p3 = tree.insert(1, 2, 3);
    chai.expect(tree.size).equals(1);
    chai.expect(p1).equals(p2);
    chai.expect(p1).equals(p3);
    const treenode = new CNode(memory, null, p1 << 2);
    chai.expect(treenode.value.flags).equals(1);
    chai.expect(treenode.value.fg).equals(2);
    chai.expect(treenode.value.bg).equals(3);
    chai.expect(tree.find(1, 2, 3)).equals(p1);
    const p4 = tree.insert(4, 5, 6);
    const p5 = tree.insert(4, 5, 6);
    chai.expect(tree.size).equals(2);
    chai.expect(p4).not.equals(p1);
    chai.expect(p4).equals(p5);
    treenode.setAddress(p4 << 2);
    chai.expect(treenode.value.flags).equals(4);
    chai.expect(treenode.value.fg).equals(5);
    chai.expect(treenode.value.bg).equals(6);
    chai.expect(tree.find(1, 2, 3)).equals(p1);
    chai.expect(tree.find(4, 5, 6)).equals(p4);
    const p6 = tree.insert(0, 0, 0);
    const p7 = tree.insert(23, 42, 65);
    chai.expect(tree.find(0, 0, 0)).equals(p6);
    chai.expect(tree.find(23, 42, 65)).equals(p7);
    chai.expect(tree.find(666, 666, 666)).equals(0); // not in tree
  });
  describe('remove', function(): void {
    const memory = new PoolMemory(CNode.bytes, 3);
    // catch free calls to inspect pointers
    const oldFree = memory.free.bind(memory);
    const freedPointers: number[] = [];
    memory.free = function(address: Address): void { oldFree(address); freedPointers.push(address >> 2); };
    const tree = new AttributeTree(memory);
    const pointers = [];
    for (let i = 0; i < 111; ++i) pointers.push(tree.insert(i, 0, 0));
    for (let i = 0; i < 111; ++i) {
      const res = tree.remove(i, 0, 0);
      chai.expect(res).equals(1);
      chai.expect(tree.size).equals(110 - i);
    }
    // all should be freed in the create order
    chai.expect(freedPointers).eql(pointers);
  });
  it('iterator', function(): void {
    const tree = new AttributeTree(new PoolMemory(CNode.bytes, 3));
    const pointers = [];
    for (let i = 0; i < 11; ++i) pointers.push(tree.insert(i, 0, 0));
    chai.expect(tree.iterator().toArray()).eql(pointers);
    chai.expect(tree.iterator(true).toArray()).eql(pointers.reverse());
    chai.expect(tree.iterator().toArray().length).eql(tree.size);
  });
  it('tree correctness', function(): void {
    const tree = new AttributeTree(new PoolMemory(CNode.bytes, 1));
    const values = [];
    for (let i = 0; i < 1000; ++i) values.push(Math.random() * 0x80000000 | 0);
    // test after new insert
    for (let i = 0; i < 1000; ++i) {
      tree.insert(values[i], 0, 0);
      treeAssert(tree, tree.root);
    }
    // second and third run with no real inserts
    for (let i = 0; i < 1000; ++i) {
      tree.insert(values[i], 0, 0);
      treeAssert(tree, tree.root);
      tree.insert(values[i], 0, 0);
      treeAssert(tree, tree.root);
    }
    // test remove
    for (let i = 0; i < 1000; ++i) {
      tree.remove(values[i], 0, 0);
      treeAssert(tree, tree.root);
    }
    chai.expect(tree.size).equals(0);
  });
});
describe('Attributes', function(): void {
  let attr: Attributes = null;
  beforeEach(function(): void {
    attr = new Attributes();
  });
  it('bold', function(): void {
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
    attr.setBold(false);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
    attr.setBold(true);
    chai.expect(attr.isBold()).equals(true);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
    attr.setBold(true);
    chai.expect(attr.isBold()).equals(true);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
    attr.setBold(false);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
  });
  it('underline', function(): void {
    attr.setUnderline(true);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(true);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
    attr.setUnderline(false);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
  });
  it('blink', function(): void {
    attr.setBlink(true);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(true);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
    attr.setBlink(false);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
  });
  it('inverse', function(): void {
    attr.setInverse(true);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(true);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
    attr.setInverse(false);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
  });
  it('invisible', function(): void {
    attr.setInvisible(true);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(true);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
    attr.setInvisible(false);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
  });
  it('dim', function(): void {
    attr.setDim(true);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(true);
    chai.expect(attr.isItalic()).equals(false);
    attr.setDim(false);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
  });
  it('italic', function(): void {
    attr.setItalic(true);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(true);
    attr.setItalic(false);
    chai.expect(attr.isBold()).equals(false);
    chai.expect(attr.isUnderline()).equals(false);
    chai.expect(attr.isBlink()).equals(false);
    chai.expect(attr.isInverse()).equals(false);
    chai.expect(attr.isInvisible()).equals(false);
    chai.expect(attr.isDim()).equals(false);
    chai.expect(attr.isItalic()).equals(false);
  });
  it('multiple single bit attributes', function(): void {
    attr.setBold(true);
    attr.setUnderline(true);
    attr.setDim(true);
    chai.expect(attr.isBold()).equals(true);
    chai.expect(attr.isUnderline()).equals(true);
    chai.expect(attr.isDim()).equals(true);
  });
  it('FGMode.DEFAULT', function(): void {
    chai.expect(attr.hasRGB()).equals(false);
    chai.expect(attr.getFGMode()).equals(FGMode.DEFAULT);
    attr.setFG(123); // NOOP
    chai.expect(attr.getFG()).equals(0);
  });
  it('FGMode.P16', function(): void {
    attr.setFGMode(FGMode.P16);
    chai.expect(attr.hasRGB()).equals(false);
    chai.expect(attr.getFGMode()).equals(FGMode.P16);
    attr.setFG(123);
    chai.expect(attr.getFG()).equals(123); // not truncated to 16 values
  });
  it('FGMode.P256', function(): void {
    attr.setFGMode(FGMode.P256);
    chai.expect(attr.hasRGB()).equals(false);
    chai.expect(attr.getFGMode()).equals(FGMode.P256);
    attr.setFG(123);
    chai.expect(attr.getFG()).equals(123);
  });
  it('FGMode.RGB', function(): void {
    attr.setFGMode(FGMode.RGB);
    chai.expect(attr.hasRGB()).equals(true);
    chai.expect(attr.getFGMode()).equals(FGMode.RGB);
    attr.setFG(123456789);
    chai.expect(attr.getFG()).equals(123456789);
    const rgb = {red: 12, green: 34, blue: 56};
    attr.setFG(Attributes.fromRGB(rgb));
    chai.expect(attr.getFG()).equals(12 << 16 | 34 << 8 | 56);
    chai.expect(Attributes.toRGB(attr.getFG())).eql(rgb);
  });
  it('BGMode.DEFAULT', function(): void {
    chai.expect(attr.hasRGB()).equals(false);
    chai.expect(attr.getBGMode()).equals(BGMode.DEFAULT);
    attr.setBG(123); // NOOP
    chai.expect(attr.getBG()).equals(0);
  });
  it('BGMode.P16', function(): void {
    attr.setBGMode(BGMode.P16);
    chai.expect(attr.hasRGB()).equals(false);
    chai.expect(attr.getBGMode()).equals(BGMode.P16);
    attr.setBG(123);
    chai.expect(attr.getBG()).equals(123); // not truncated to 16 values
  });
  it('BGMode.P256', function(): void {
    attr.setBGMode(BGMode.P256);
    chai.expect(attr.hasRGB()).equals(false);
    chai.expect(attr.getBGMode()).equals(BGMode.P256);
    attr.setBG(123);
    chai.expect(attr.getBG()).equals(123);
  });
  it('BGMode.RGB', function(): void {
    attr.setBGMode(BGMode.RGB);
    chai.expect(attr.hasRGB()).equals(true);
    chai.expect(attr.getBGMode()).equals(BGMode.RGB);
    attr.setBG(123456789);
    chai.expect(attr.getBG()).equals(123456789);
    const rgb = {red: 12, green: 34, blue: 56};
    attr.setBG(Attributes.fromRGB(rgb));
    chai.expect(attr.getBG()).equals(12 << 16 | 34 << 8 | 56);
    chai.expect(Attributes.toRGB(attr.getBG())).eql(rgb);
  });
});
describe('AttributeStorage', function(): void {
  it('ref & unref', function(): void {
    const as = new AttributeStorage();
    const attr = new Attributes();  // no flags set at all - address should be 0
    chai.expect(as.ref(attr)).equals(0);
    attr.setBold(true);
    chai.expect(as.ref(attr)).equals(Flags.BOLD);
    attr.setItalic(true);
    chai.expect(as.ref(attr)).equals(Flags.BOLD | Flags.ITALIC);
    attr.setFGMode(FGMode.P256);
    attr.setFG(123);
    chai.expect(as.ref(attr)).equals(Flags.BOLD | Flags.ITALIC | FGMode.P256 | 123);
    chai.expect(as.tree.size).equals(0);  // no tree nodes yet
    // RGB - with treenodes and ref counting
    attr.setBGMode(BGMode.RGB);
    const p1 = as.ref(attr);
    chai.expect(!!(p1 & Flags.POINTER)).equals(true);
    chai.expect(as.tree.size).equals(1);  // attr was saved in tree?
    const found = as.tree.find(attr.flags, attr.fg, attr.bg);
    chai.expect(found).not.equals(0);
    const treenode = new CNode(as.m, null, found << 2);
    chai.expect(treenode.value.flags).equals(attr.flags);
    chai.expect(treenode.value.ref).equals(1);
    const p2 = as.ref(attr);
    chai.expect(p2).equals(p1);
    chai.expect(treenode.value.ref).equals(2);
    for (let i = 0; i < 100; ++i) as.ref(attr);
    chai.expect(treenode.value.ref).equals(102);
    // unref
    for (let i = 0; i < 100; ++i) as.unref(p1);
    chai.expect(treenode.value.ref).equals(2);
    as.unref(p1);
    chai.expect(treenode.value.ref).equals(1);
    chai.expect(as.tree.size).equals(1);
    as.unref(p1);
    chai.expect(as.tree.size).equals(0);
    const p3 = as.ref(attr);
    chai.expect(as.tree.size).equals(1);
    // change a value and ref again
    attr.setUnderline(true);
    const p4 = as.ref(attr);
    chai.expect(as.tree.size).equals(2);  // should have created another tree node
    chai.expect(p4).not.equals(p3);
  });
  it('fromAddress', function(): void {
    const as = new AttributeStorage();
    const attr = new Attributes(123);
    const ref = new Attributes();
    const p1 = as.ref(attr);
    chai.expect(as.fromAddress(p1)).eql(attr);      // new object
    attr.setUnderline(true);
    attr.setFGMode(FGMode.P256);
    const p2 = as.ref(attr);
    chai.expect(as.fromAddress(p2, ref)).eql(attr); // ref w'o tree
    attr.setBGMode(BGMode.RGB);
    attr.setBG(123456789);
    const p3 = as.ref(attr);
    chai.expect(as.fromAddress(p3)).eql(attr);      // ref with tree
  });
});
