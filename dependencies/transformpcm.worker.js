/**
 * Created by lycheng on 2019/8/9.
 */
module.exports  = class recorderWorker {
  constructor(config, appId, apiKey) {}

  static onmessage(e) {
    if (e.command === 'transform') {
      return transform.transaction(e.buffer);
    }
  }
}

var transform = {
  transaction(buffer) {
    var bufTo16kHz = transform.to16kHz(buffer);
    var bufTo16BitPCM = transform.to16BitPCM(bufTo16kHz);
    // var bufToBase64 = transform.toBase64(bufTo16BitPCM)
    return [...bufTo16BitPCM];
  },
  to16kHz(buffer) {
    var data = new Float32Array(buffer);
    var fitCount = Math.round(data.length * (16000 / 44100));
    var newData = new Float32Array(fitCount);
    var springFactor = (data.length - 1) / (fitCount - 1);
    newData[0] = data[0];
    for (var i = 1; i < fitCount - 1; i++) {
      var tmp = i * springFactor;
      var before = Math.floor(tmp).toFixed();
      var after = Math.ceil(tmp).toFixed();
      var atPoint = tmp - before;
      newData[i] = data[before] + (data[after] - data[before]) * atPoint;
    }
    newData[fitCount - 1] = data[data.length - 1];
    return newData;
  },

  to16BitPCM(input) {
    var dataLength = input.length * (16 / 8);
    var dataBuffer = new ArrayBuffer(dataLength);
    var dataView = new DataView(dataBuffer);
    var offset = 0;
    for (var i = 0; i < input.length; i++, offset += 2) {
      var s = Math.max(-1, Math.min(1, input[i]));
      dataView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return Array.from(new Int8Array(dataView.buffer));
  },
  toBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  },
};
