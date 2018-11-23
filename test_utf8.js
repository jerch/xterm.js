const fs = require('fs');
const decode = require('./utf8.js').decode;

function throughputWidth(filename) {
  let data = fs.readFileSync(filename);
  //let content = '';
  //while (content.length < 50000000)  // test with +50MB
  //  content += data.toString('UTF-8');

  let sum = 0;
  var codePoints = new Uint32Array(10000000);
  let start = new Date();
  const l = decode(data, codePoints);
  let duration = (new Date()) - (start);
  console.log({
    //result: s,
    Throughput: Number(1000/duration*data.length/1024/1024).toFixed(2) + ' MB/s',
    File: filename,
    Duration: duration,
    Size: l
  });
}

throughputWidth('./benchmark_data1');
throughputWidth('./benchmark_data1');
throughputWidth('./ch_out');
