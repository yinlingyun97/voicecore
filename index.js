/**
 * Created by iflytek on 2019/11/12.
 *
 * 实时转写调用demo
 * 此demo只是一个简单的调用示例，不适合用到实际生产环境中
 *
 * 实时语音转写 WebAPI 接口调用示例 接口文档（必看）：https://www.xfyun.cn/doc/asr/rtasr/API.html
 * 错误码链接：
 * https://www.xfyun.cn/doc/asr/rtasr/API.html
 * https://www.xfyun.cn/document/error-code （code返回错误码时必看）
 *
 */
require('./dependencies/enc-base64-min');
// 音频转码worker
var recorderWorker = require('./dependencies/transformpcm.worker').recorderWorker;
// 记录处理的缓存音频
var buffers = [];
var AudioContext = window.AudioContext || window.webkitAudioContext;
var notSupportTip = '请试用chrome浏览器且域名为localhost或127.0.0.1测试';
var md5 = require('./dependencies/md5');
var CryptoJSNew = require('./dependencies/HmacSHA1').CryptoJSNew;
var CryptoJS = require('./dependencies/hmac-sha256').CryptoJS;
navigator.getUserMedia =
  navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia ||
  navigator.msGetUserMedia;

/**
 *
 * @Description: 类说明
 * @method 类名 IatRecorder
 * @param {object} 参数名 config  参数说明 语音助手开启和结束时调用的方法
 * @param {Array} 参数名 textData  参数说明 语音指令集合
 * @param {string} 参数名 appId  参数说明 讯飞实时语音转写接口appId
 * @param {string} 参数名 apiKey  参数说明 讯飞实时语音转写接口apiKey
 */
export class voiceCore {
  constructor(config, textData, appId, apiKey) {
    this.config = config;
    this.config.onMessage = (message) => {
      var text = setResult(JSON.parse(message));
      text.then((res) => {
          var pure = pureString(res);
          if(!textData || !Array.isArray(textData)){
            console.info('数据格式错误，请检查格式');
            if (this.config.onError && typeof this.config.onError == 'function') {
              this.config.onError('数据格式错误，请检查格式');
            }
            return null
          }
          if (pure !== '' ) {
            if(!checkStrResult(config,textData,pure) && this.config.matchFailed && typeof this.config.matchFailed == 'function') {
              this.config.matchFailed({
                result:pure,
                dsc:'无匹配数据'
              })
            }
          }
        },
        (err) => {
          if (this.config.onError && typeof this.config.onError == 'function') {
            this.config.onError(err);
          }
        })
    };
    this.state = 'ing';
    //以下信息在控制台-我的应用-实时语音转写 页面获取
    this.appId = appId;
    this.apiKey = apiKey;
  }

  start() {
    this.stop();
    if (navigator.getUserMedia && AudioContext) {
      this.state = 'ing';
      if (!this.recorder) {
        const context = new AudioContext();
        this.context = context;
        this.recorder = context.createScriptProcessor(0, 1, 1);
        const getMediaSuccess = (stream) => {
          this.mediaStream = this.context.createMediaStreamSource(stream);
          this.recorder.onaudioprocess = (e) => {
            this.sendData(e.inputBuffer.getChannelData(0));
          };
          this.connectWebsocket();
        };
        const getMediaFail = (e) => {
          this.recorder = null;
          this.mediaStream = null;
          this.context = null;
          if (this.config.onError && typeof this.config.onError == 'function') {
            this.config.onError('请求麦克风失败');
          }
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
      alert(notSupportTip);
    }
  }

  stop() {
    this.state = 'end';
    try {
      this.mediaStream.disconnect(this.recorder);
      this.recorder.disconnect();
    } catch (e) {
    }
  }

  sendData = (buffer) => {
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
    const ts = Math.floor(new Date().getTime() / 1000); /*new Date().getTime()/1000+'';*/
    const signa = md5.hex_md5(appId + ts); //hex_md5(encodeURIComponent(appId + ts));//EncryptUtil.HmacSHA1Encrypt(EncryptUtil.MD5(appId + ts), secretKey);
    const signatureSha = CryptoJSNew.HmacSHA1(signa, secretKey);
    var signature = CryptoJS.enc.Base64.stringify(signatureSha);
    signature = encodeURIComponent(signature);
    return '?appid=' + appId + '&ts=' + ts + '&signa=' + signature;
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
      // this.config.onMessage && this.config.onMessage(e);
      this.wsOnMessage(e);
    };
    this.ws.onerror = (e) => {
      this.stop();
      this.config.onError && this.config.onError(e);
    };
    this.ws.onclose = (e) => {
      this.stop();
      this.config.onClose && this.config.onClose(e);
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
        return false;
      }
      const audioData = buffers.splice(0, 1280);
      if (audioData.length > 0) {
        this.ws.send(new Int8Array(audioData));
      }
    }, 40);
  }

  wsOnMessage(e) {
    var jsonData = JSON.parse(e.data);
    if (jsonData.action == 'started') {
      // 握手成功
      console.log('握手成功');
    } else if (jsonData.action == 'result') {
      // 转写结果
      if (this.config.onMessage && typeof this.config.onMessage == 'function') {
        this.config.onMessage(jsonData.data);
      }
    } else if (jsonData.action == 'error') {
      // 连接发生错误
      console.log('出错了:', jsonData);
      if (this.config.onError && typeof this.config.onError == 'function') {
        this.config.onError(jsonData);
      }
    }
  }

  ArrayBufferToBase64 = (buffer) => {
    var binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };
}

/**
 *
 * @Description: 方法说明 从之前设置的数据进行语句匹配，如果匹配成功则运行对应的成功方法
 * @method 方法名 checkStrResult
 * @return { Boolean } 返回值说明 匹配成功与否
 * @param config 语音助手各项回调函数的配置
 * @param textData 预先设置的语句数据
 * @param pureStr 接口返回的净化后的字符串
 */
async function checkStrResult(config,textData,pureStr) {
  let str = false;
  await textData.forEach((item, index) => {
    var textArray = item.text.split("|");
    textArray.forEach((textItem) => {
      if (pureStr.indexOf(textItem) > -1 && item.success && typeof item.success == 'function') {
        str = true;
        item.success(item, index);
      }
    })
  });
  return str
}

/**
 *
 * @Description: 方法说明 从讯飞语音识别引擎返回参数筛选出识别结果
 * @method 方法名 setResult
 * @return {number | string } 返回值说明 语音识别结果
 * @param data 讯飞语音识别引擎返回结果
 */
async function setResult(data) {
  let rtasrResult = [];
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
