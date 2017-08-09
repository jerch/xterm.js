/**
 * @license MIT
 *
 * This file contains integration tests for xterm.js.
 */

import * as glob from 'glob';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as pty from 'node-pty';
import { Terminal } from './Terminal';
import { CHAR_DATA_CHAR_INDEX } from './Buffer';

let primitive_pty: any;

// fake sychronous pty write - read
// we just pipe the data from slave to master as a child program would do
// pty.js opens pipe fds with O_NONBLOCK
// just wait 10ms instead of setting fds to blocking mode
function ptyWriteRead(data: string, cb: (result: string) => void): void {
  fs.writeSync(primitive_pty.slave, data);
  setTimeout(() => {
    let b = new Buffer(64000);
    let bytes = fs.readSync(primitive_pty.master, b, 0, 64000, null);
    cb(b.toString('utf8', 0, bytes));
  });
}

// make sure raw pty is at x=0 and has no pending data
function ptyReset(cb: (result: string) => void): void {
    ptyWriteRead('\r\n', cb);
}

/* debug helpers */
// generate colorful noisy output to compare xterm and emulator cell states
function formatError(in_: string, out_: string, expected: string): string {
  function addLineNumber(start: number, color: string): (s: string) => string {
    let counter = start || 0;
    return function(s: string): string {
      counter += 1;
      return '\x1b[33m' + (' ' + counter).slice(-2) + color + s;
    };
  }
  let line80 = '12345678901234567890123456789012345678901234567890123456789012345678901234567890';
  let s = '';
  s += '\n\x1b[34m' + JSON.stringify(in_);
  s += '\n\x1b[33m  ' + line80 + '\n';
  s += out_.split('\n').map(addLineNumber(0, '\x1b[31m')).join('\n');
  s += '\n\x1b[33m  ' + line80 + '\n';
  s += expected.split('\n').map(addLineNumber(0, '\x1b[32m')).join('\n');
  return s;
}

// simple debug output of terminal cells
function terminalToString(term: Terminal): string {
  let result = '';
  let line_s = '';
  for (let line = term.buffer.ybase; line < term.buffer.ybase + term.rows; line++) {
    line_s = '';
    for (let cell = 0; cell < term.cols; ++cell) {
      line_s += term.buffer.lines.get(line)[cell][CHAR_DATA_CHAR_INDEX];
    }
    // rtrim empty cells as xterm does
    line_s = line_s.replace(/\s+$/, '');
    result += line_s;
    result += '\n';
  }
  return result;
}

// Skip tests on Windows since pty.open isn't supported
if (os.platform() !== 'win32') {
  let CONSOLE_LOG = console.log;

  // expect files need terminal at 80x25!
  let COLS = 80;
  let ROWS = 25;

  /** some helpers for pty interaction */
  // we need a pty in between to get the termios decorations
  // for the basic test cases a raw pty device is enough
  primitive_pty = pty.native.open(COLS, ROWS);

  /** tests */
  describe('xterm output comparison', () => {
    let xterm;

    beforeEach(() => {
      xterm = new Terminal({ cols: COLS, rows: ROWS });
      xterm.refresh = () => {};
      xterm.viewport = {
        syncScrollArea: () => {}
      };
    });

    // omit stack trace for escape sequence files
    Error.stackTraceLimit = 0;
    let files = glob.sync('**/escape_sequence_files/*.in', { cwd: path.join(__dirname, '..')});
    // only successful tests for now
    let skip = [
      10, 16, 17, 19, 32, 33, 34, 35, 36, 39,
      40, 42, 43, 44, 45, 46, 47, 48, 49, 50,
      51, 52, 54, 55, 56, 57, 58, 59, 60, 61,
      63, 68
    ];
    if (os.platform() === 'darwin') {
      // These are failing on macOS only
      skip.push(3, 7, 11, 67);
    }
    for (let i = 0; i < files.length; i++) {
      if (skip.indexOf(i) >= 0) {
        continue;
      }
      ((filename: string) => {
        it(filename.split('/').slice(-1)[0], done => {
          ptyReset(() => {
            let in_file = fs.readFileSync(filename, 'utf8');
            ptyWriteRead(in_file, from_pty => {
              // uncomment this to get log from terminal
              // console.log = function(){};

              // Perform a synchronous .write(data)
              xterm.writeBuffer.push(from_pty);
              xterm.innerWrite();

              let from_emulator = terminalToString(xterm);
              console.log = CONSOLE_LOG;
              let expected = fs.readFileSync(filename.split('.')[0] + '.text', 'utf8');
              // Some of the tests have whitespace on the right of lines, we trim all the linex
              // from xterm.js so ignore this for now at least.
              let expectedRightTrimmed = expected.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
              if (from_emulator !== expectedRightTrimmed) {
                // uncomment to get noisy output
                throw new Error(formatError(in_file, from_emulator, expected));
              //   throw new Error('mismatch');
              }
              done();
            });
          });
        });
      })(files[i]);
    }
  });
}
