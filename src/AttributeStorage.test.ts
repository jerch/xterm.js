/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { TextAttributes, AttributeStorage, FLAGS, IColorsRef } from './AttributeStorage';
import * as chai from 'chai';

describe('AttributeStorage', function(): void {
  describe('TextAttributes', function(): void {
    it('get flags', function(): void {
        // all should be zero
        let attrs = new TextAttributes(0, 0, 0);
        chai.expect(attrs.bold).equal(0);
        chai.expect(attrs.underline).equal(0);
        chai.expect(attrs.blink).equal(0);
        chai.expect(attrs.inverse).equal(0);
        chai.expect(attrs.invisible).equal(0);
        chai.expect(attrs.dim).equal(0);
        chai.expect(attrs.italic).equal(0);
        // all should be set
        attrs = new TextAttributes(127, 0, 0);
        chai.expect(attrs.bold).equal(FLAGS.BOLD);
        chai.expect(attrs.underline).equal(FLAGS.UNDERLINE);
        chai.expect(attrs.blink).equal(FLAGS.BLINK);
        chai.expect(attrs.inverse).equal(FLAGS.INVERSE);
        chai.expect(attrs.invisible).equal(FLAGS.INVISIBLE);
        chai.expect(attrs.dim).equal(FLAGS.DIM);
        chai.expect(attrs.italic).equal(FLAGS.ITALIC);
    });
    it('set flags', function(): void {
        const attrs = new TextAttributes(0, 0, 0);
        attrs.bold = 1;
        attrs.underline = 1;
        attrs.blink = 1;
        attrs.inverse = 1;
        attrs.invisible = 1;
        attrs.dim = 1;
        attrs.italic = 1;
        chai.expect(attrs.bold).equal(FLAGS.BOLD);
        chai.expect(attrs.underline).equal(FLAGS.UNDERLINE);
        chai.expect(attrs.blink).equal(FLAGS.BLINK);
        chai.expect(attrs.inverse).equal(FLAGS.INVERSE);
        chai.expect(attrs.invisible).equal(FLAGS.INVISIBLE);
        chai.expect(attrs.dim).equal(FLAGS.DIM);
        chai.expect(attrs.italic).equal(FLAGS.ITALIC);
        chai.expect(attrs.flags).equal(127);
        attrs.bold = 0;
        attrs.underline = 0;
        attrs.blink = 0;
        attrs.inverse = 0;
        attrs.invisible = 0;
        attrs.dim = 0;
        attrs.italic = 0;
        chai.expect(attrs.bold).equal(0);
        chai.expect(attrs.underline).equal(0);
        chai.expect(attrs.blink).equal(0);
        chai.expect(attrs.inverse).equal(0);
        chai.expect(attrs.invisible).equal(0);
        chai.expect(attrs.dim).equal(0);
        chai.expect(attrs.italic).equal(0);
        chai.expect(attrs.flags).equal(0);
    });
    it('get colors', function(): void {
        // all zero --> RGB off, indexed color 0
        let attrs = new TextAttributes(0, 0, 0);
        chai.expect(attrs.fg).equal(0);
        chai.expect(attrs.fgRGB).equal(0);
        chai.expect(attrs.fgRef).eql({R: 0, G: 0, B: 0, indexed: 0});
        chai.expect(attrs.bg).equal(0);
        chai.expect(attrs.bgRGB).equal(0);
        chai.expect(attrs.bgRef).eql({R: 0, G: 0, B: 0, indexed: 0});
        // all 255 --> RGB on, all RGB values are 255
        attrs = new TextAttributes(0, -1, -1);
        chai.expect(attrs.fg).equal(-1);
        chai.expect(attrs.fgRGB !== 0).equal(true);
        chai.expect(attrs.fgRef).eql({R: 255, G: 255, B: 255, indexed: 0});
        chai.expect(attrs.bg).equal(-1);
        chai.expect(attrs.bgRGB !== 0).equal(true);
        chai.expect(attrs.bgRef).eql({R: 255, G: 255, B: 255, indexed: 0});
        // simple indexed colors
        attrs = new TextAttributes(0, 12, 34);
        chai.expect(attrs.fg).equal(12);
        chai.expect(attrs.fgRGB).equal(0);
        chai.expect(attrs.fgRef).eql({R: 0, G: 0, B: 0, indexed: 12});
        chai.expect(attrs.bg).equal(34);
        chai.expect(attrs.bgRGB).equal(0);
        chai.expect(attrs.bgRef).eql({R: 0, G: 0, B: 0, indexed: 34});
        // RGB colors
        attrs = new TextAttributes(0, (12 << 16) | (34 << 8) | 56 | 0x80000000, -1);
        chai.expect(attrs.fg).equal((12 << 16) | (34 << 8) | 56 | 0x80000000);
        chai.expect(attrs.fgRGB !== 0).equal(true);
        chai.expect(attrs.fgRef).eql({R: 12, G: 34, B: 56, indexed: 0});
        chai.expect(attrs.bg).equal(-1);
        chai.expect(attrs.bgRGB !== 0).equal(true);
        chai.expect(attrs.bgRef).eql({R: 255, G: 255, B: 255, indexed: 0});
    });
    it('set colors', function(): void {
        let attrs = new TextAttributes(0, 0, 0);
        attrs.fgRGB = 1;
        attrs.fgRef = {R: 12, G: 34, B: 56, indexed: 123};
        chai.expect(attrs.fgRef).eql({R: 12, G: 34, B: 56, indexed: 0});
        chai.expect(attrs.fg).equal((12 << 16) | (34 << 8) | 56 | 0x80000000);
    });
  });
});
