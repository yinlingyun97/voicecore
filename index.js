'use strict'

require('./dependencies/enc-base64-min');
// 音频转码worker
var recorderWorker = require('./dependencies/transformpcm.worker');
// 记录处理的缓存音频
var buffers = [];
var AudioContext = window.AudioContext || window.webkitAudioContext;
var notSupportTip = '请使用chrome浏览器';
var md5 = require('./dependencies/md5');
var CryptoJSNew = require('./dependencies/HmacSHA1');
var CryptoJS = require('./dependencies/hmac-sha256');
navigator.getUserMedia =
  navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia ||
  navigator.msGetUserMedia;

/**
 *
 * @Description: 方法说明 从讯飞语音识别引擎返回参数筛选出识别结果
 * @method 方法名 setResult
 * @return {number | string } 返回值说明 语音识别结果
 * @param data 讯飞语音识别引擎返回结果
 */
async function setResult(data) {
  var rtasrResult = [];
  rtasrResult[data.seg_id] = data;
  let str = '';
  await rtasrResult.forEach(i => {
    if (i.cn.st.type == 0) {
      i.cn.st.rt.forEach(j => {
        j.ws.forEach(k => {
          k.cw.forEach(l => {
            str += l.w
          })
        })
      });
    }
  });
  return str
}

/**
 *
 * @Description: 方法说明 处理数据格式 去中英文标点符号
 * @method 方法名 pureString
 * @return {number | string } 返回值说明 去逗号之后的数据
 * @param str 需要净化的字符串
 */
function pureString(str) {
  return str.replace(/[\ |\~|\`|\!|\@|\#|\$|\%|\^|\&|\*|\(|\)|\-|\_|\+|\=|\||\\|\[|\]|\{|\}|\;|\:|\"|\'|\,|\，|\、|\。|\？|\<|\.|\>|\/|\?]/g, "");
}

/**
 *
 * @Description: 方法说明 从之前设置的数据进行语句匹配，如果匹配成功则运行对应的成功方法
 * @method 方法名 checkStrResult
 * @return {Promise<>} 返回值说明 匹配成功与否
 * @param textData 预先设置的语句数据
 * @param pureStr 接口返回的净化后的字符串
 */
function checkStrResult(textData, pureStr,that) {
  return new Promise((resolve, reject) => {
      textData.forEach((item, index) => {
        var textArray = item.text.split("|");
        for(let i=0;i<=textArray.length-1;i++){
          if (pureStr.indexOf(textArray[i]) > -1 && item.success && typeof item.success == 'function') {
            item.success(item);
            if (that.config.textResponse && typeof that.config.textResponse == 'function') {
              that.config.textResponse({
                result: pureStr,
                dsc: '匹配成功'
              });
              resolve(false);
              break
            }
            resolve(false);
            break
          }
        }
      });
      resolve(pureStr)
    }
  );
}

/**
 *
 * @Description: 类说明
 * @method 类名 IatRecorder
 * @param {object} 参数名 config  参数说明 语音助手开启和结束时调用的方法
 * @param {Array} 参数名 textData  参数说明 语音指令集合
 * @param {string} 参数名 appId  参数说明 讯飞实时语音转写接口appId
 * @param {string} 参数名 apiKey  参数说明 讯飞实时语音转写接口apiKey
 */
module.exports = class VoiceCore {
  constructor(config, textData, appId, apiKey) {
    this.config = config;
    this.config.onMessage = (message) => {
      var text = setResult(JSON.parse(message));
      text.then((res) => {
          var pure = pureString(res);
          if (!textData || !Array.isArray(textData)) {
            console.info('数据格式错误，请检查格式');
            if (this.config.onError && typeof this.config.onError == 'function') {
              this.stop();
              this.config.onError('数据格式错误，请检查格式');
            }
            throw '传入数据格式错误，请检查格式'
          }
          if (pure !== '') {
            const strResult = checkStrResult(textData, pure,this);
            strResult.then((val) => {
              if (val && this.config.textResponse && typeof this.config.textResponse == 'function') {
                this.config.textResponse({
                  result: val,
                  dsc: '无匹配数据'
                })
              }
            })
          }
        },
        (err) => {
          if (this.config.onError && typeof this.config.onError == 'function') {
            this.stop();
            this.config.onError(err);
          }
          throw err
        })
    };
    this.state = 'end';
    // 以下信息在控制台-我的应用-实时语音转写 页面获取
    if (!appId || appId === '' || typeof appId !== 'string') {
      if (this.config.onError && typeof this.config.onError == 'function') {
        this.stop();
        this.config.onError('appId为空或格式错误');
      }
      throw 'appId为空或格式错误'
    }
    if (!apiKey || apiKey === '' || typeof apiKey !== 'string') {
      if (this.config.onError && typeof this.config.onError == 'function') {
        this.stop();
        this.config.onError('apiKey为空或格式错误');
      }
      throw 'apiKey为空或格式错误'
    }
    this.appId = appId;
    this.apiKey = apiKey;
  }

  start() {
    // this.stop();
    if(this.state === 'ing'){
      if (this.config.onError && typeof this.config.onError == 'function') {
        this.stop();
        this.config.onError('已经开启无须重复开启');
      }
      return false
    }
    if (navigator.getUserMedia && AudioContext) {
      this.state = 'ing';
      if (!this.recorder) {
        const context = new AudioContext();
        this.context = context;
        this.recorder = context.createScriptProcessor(0, 1, 1);
        const getMediaSuccess = (stream) => {
          this.mediaStream = this.context.createMediaStreamSource(stream);
          this.recorder.onaudioprocess = (e) => {
            const voiceData = e.inputBuffer.getChannelData(0);
            this.sendData(voiceData);
            const maxVal = Math.max.apply(Math, voiceData);
            // 显示音量值
            if (this.config.voiceValue && typeof this.config.voiceValue == 'function') {
              this.config.voiceValue(Math.round(maxVal * 100));
            }
          };
          this.connectWebsocket();
        };
        const getMediaFail = (e) => {
          this.recorder = null;
          this.mediaStream = null;
          this.context = null;
          if (this.config.onError && typeof this.config.onError == 'function') {
            this.stop();
            this.config.onError('请求麦克风失败');
          }
          throw e
        };
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices
            .getUserMedia({
              audio: true,
              video: false,
            })
            .then((stream) => {
              getMediaSuccess(stream);
            })
            .catch((e) => {
              getMediaFail(e);
            });
        } else {
          navigator.getUserMedia(
            {
              audio: true,
              video: false,
            },
            (stream) => {
              getMediaSuccess(stream);
            },
            function (e) {
              getMediaFail(e);
            },
          );
        }
      } else {
        this.connectWebsocket();
      }
    } else {
      const isChrome = navigator.userAgent.toLowerCase().match(/chrome/);
      if (this.config.onError && typeof this.config.onError == 'function') {
        this.stop();
        this.config.onError(notSupportTip);
      }
      throw notSupportTip
    }
  }

  stop() {
    this.state = 'end';
    try {
      this.mediaStream.disconnect(this.recorder);
      this.recorder.disconnect();
      if (this.config.voiceValue && typeof this.config.voiceValue == 'function') {
        this.config.voiceValue(0);
      }
      setTimeout(()=>{
        if (this.config.onClose && typeof this.config.onClose == 'function') {
          this.config.onClose();
        }
      },500);
    } catch (e) {
      // if (this.config.onError && typeof this.config.onError == 'function') {
      //   this.config.onError(e);
      // }
    }
  }

  sendData (buffer) {
    var data = {
      command: 'transform',
      buffer: buffer,
    };
    buffers = recorderWorker.onmessage(data);
  };

  // 生成握手参数
  getHandShakeParams() {
    const appId = this.appId;
    const secretKey = this.apiKey;
    const ts = Math.floor(new Date().getTime() / 1000); /* new Date().getTime()/1000+''; */
    const signa = md5.hex_md5(appId + ts); // hex_md5(encodeURIComponent(appId + ts));//EncryptUtil.HmacSHA1Encrypt(EncryptUtil.MD5(appId + ts), secretKey);
    const signatureSha = CryptoJSNew.HmacSHA1(signa, secretKey);
    var signature = CryptoJS.enc.Base64.stringify(signatureSha);
    signature = encodeURIComponent(signature);
    return `?appid=${  appId  }&ts=${  ts  }&signa=${  signature}`;
  }

  connectWebsocket() {
    var url = 'wss://rtasr.xfyun.cn/v1/ws';
    const urlParam = this.getHandShakeParams();

    url = `${url}${urlParam}`;
    if ('WebSocket' in window) {
      this.ws = new WebSocket(url);
    } else if ('MozWebSocket' in window) {
      this.ws = new MozWebSocket(url);
    } else {
      alert(notSupportTip);
      return null;
    }
    this.ws.onopen = (e) => {
      this.mediaStream.connect(this.recorder);
      this.recorder.connect(this.context.destination);
      setTimeout(() => {
        this.wsOpened(e);
      }, 500);
      this.config.onStart && this.config.onStart(e);
    };
    this.ws.onmessage = (e) => {
      if (this.config.startMatching && typeof this.config.startMatching == 'function') {
        this.config.startMatching();
      }
      setTimeout(()=>{
        this.wsOnMessage(e);
      },1000)
    };
    this.ws.onerror = (e) => {
      this.stop();
      this.config.onError && this.config.onError(e);
    };
    this.ws.onclose = (e) => {
      this.stop();
    };
  }

  wsOpened() {
    if (this.ws.readyState !== 1) {
      return;
    }
    const audioData = buffers.splice(0, 1280);
    this.ws.send(new Int8Array(audioData));
    this.handlerInterval = setInterval(() => {
      // websocket未连接
      if (this.ws.readyState !== 1) {
        clearInterval(this.handlerInterval);
        return;
      }
      if (buffers.length === 0) {
        if (this.state === 'end') {
          this.ws.send('{"end": true}');
          clearInterval(this.handlerInterval);
        }
        return;
      }
      const voiceData = buffers.splice(0, 1280);
      if (voiceData.length > 0) {
        this.ws.send(new Int8Array(voiceData));
      }
    }, 40);
  }

  wsOnMessage(e) {
    var jsonData = JSON.parse(e.data);
    if (jsonData.action == 'started') {
      // 握手成功
    } else if (jsonData.action == 'result') {
      // 转写结果
      if (this.config.onMessage && typeof this.config.onMessage == 'function') {
        this.config.onMessage(jsonData.data);
      }
    } else if (jsonData.action == 'error') {
      // 连接发生错误
      if (this.config.onError && typeof this.config.onError == 'function') {
        this.stop();
        this.config.onError(jsonData);
      }
      throw jsonData
    }
  }

  ArrayBufferToBase64(buffer){
    var binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };
};
