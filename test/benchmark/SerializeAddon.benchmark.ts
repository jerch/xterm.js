/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { perfContext, before, ThroughputRuntimeCase } from 'xterm-benchmark';

import { spawn } from 'node-pty';
import { Utf8ToUtf32, stringFromCodePoint } from 'common/input/TextDecoder';
import { Terminal } from 'xterm';
import { SerializeAddon } from 'addons/xterm-addon-serialize/src/SerializeAddon';

class TestTerminal extends Terminal {
  writeSync(data: string): void {
    (<any>this)._core.writeBuffer.push(data);
    (<any>this)._core._innerWrite();
  }
  writeSyncUtf8(data: Uint8Array): void {
    (<any>this)._core.writeBufferUtf8.push(data);
    (<any>this)._core._innerWriteUtf8();
  }
}

perfContext('Terminal: sh -c "ls -lR /usr/lib | lolcat -f"', () => {
  let content = '';
  let contentUtf8: Uint8Array;

  before(async () => {
    // grab output from "ls -lR /usr"
    const p = spawn('sh', ['-c', 'ls -lR /usr/lib'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 25,
      cwd: process.env.HOME,
      env: process.env,
      encoding: (null as unknown as string) // needs to be fixed in node-pty
    });
    const chunks: Buffer[] = [];
    let length = 0;
    p.on('data', data => {
      chunks.push(data as unknown as Buffer);
      length += data.length;
    });
    await new Promise(resolve => p.on('exit', () => resolve()));
    contentUtf8 = Buffer.concat(chunks, length);
    // translate to content string
    const buffer = new Uint32Array(contentUtf8.length);
    const decoder = new Utf8ToUtf32();
    const codepoints = decoder.decode(contentUtf8, buffer);
    for (let i = 0; i < codepoints; ++i) {
      content += stringFromCodePoint(buffer[i]);
      // peek into content to force flat repr in v8
      if (!(i % 10000000)) {
        content[i];
      }
    }
  });

  perfContext('serialize', () => {
    let terminal: TestTerminal;
    let serializeAddon = new SerializeAddon();
    before(() => {
      terminal = new TestTerminal({cols: 80, rows: 25, scrollback: 1000});
      serializeAddon.activate(terminal);
      terminal.writeSync(content);
    });
    new ThroughputRuntimeCase('', () => {
      let result = '';
      for (let i = 0; i < 10; ++i) {
        result += serializeAddon.serialize();
      }
      return {payloadSize: result.length};
    }, {fork: false}).showRuntime().showThroughput().showAverageRuntime().showAverageThroughput();
  });

  perfContext('serializePrivate', () => {
    let terminal: TestTerminal;
    let serializeAddon = new SerializeAddon();
    before(() => {
      terminal = new TestTerminal({cols: 80, rows: 25, scrollback: 1000});
      serializeAddon.activate(terminal);
      terminal.writeSync(content);
    });
    new ThroughputRuntimeCase('', () => {
      let result = '';
      for (let i = 0; i < 10; ++i) {
        result += serializeAddon.serializePrivate();
      }
      return {payloadSize: result.length};
    }, {fork: false}).showRuntime().showThroughput().showAverageRuntime().showAverageThroughput();
  });
});
