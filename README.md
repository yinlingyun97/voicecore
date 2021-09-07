## 引入
1.可以通过import方式进行引入：
  import {voiceCore} from 'voice-core';
2.可以通过require方式进行引入：
  const voiceCore = require('voice-core').voiceCore;
  
## 使用
  let voice = new voiceCore(config,textData, appId, apiKey);
  开启语音识别：voice.start() 
  关闭语音识别：voice.stop()
  
## 构造语音助手时候输入参数解释
1.config
  示例：
    let config = {
	  // 语音助手结束时调用方法
      onClose: () => {
      },
	  // 语音助手错误时输出错误方法
      onError: (err) => {
      },
      // 说话时的实时分贝值
      voiceValue:(e)=>{
        console.info(e)
      },
	  // 语音助手未找到匹配结果时调用方法
      matchFailed: (e) => {
		console.info(e) // { 'result':'识别结果','dsc':'无匹配数据'}
      },
	  // 语音助手启动时调用方法
      onStart: () => {
      },
    };

2.textData
  传入的语音数据
  
3.appId
  讯飞语音实时转写接口的服务接口认证信息，详情看链接：
  https://www.xfyun.cn/doc/asr/rtasr/API.html#%E6%8E%A5%E5%8F%A3%E8%AF%B4%E6%98%8E

4.apiKey
  讯飞语音实时转写接口的服务接口认证信息，详情看链接：
  https://www.xfyun.cn/doc/asr/rtasr/API.html#%E6%8E%A5%E5%8F%A3%E8%AF%B4%E6%98%8E
 
## 注意事项
1.请使用chrome浏览器。
2.如程序报错5位错误码，请到文档或错误码链接查询
  https://www.xfyun.cn/doc/asr/rtasr/API.html
  https://www.xfyun.cn/document/error-code
3.更详细的调用说明请参考我的CSDN文章
  https://blog.csdn.net/qq_39958056/article/details/119956288
