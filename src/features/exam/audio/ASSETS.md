# 考试音效来源

下载并核实日期：2026-11-13。音效随构建本地提供，不运行时请求第三方站点。

| 本地文件 | 原作、作者与来源 | 许可 | 处理 |
| --- | --- | --- | --- |
| `assets/turn-signal.mp3` | Car turn signals #1，Joseph SARDIN / BigSoundBank，https://bigsoundbank.com/blinker-s1021.html | CC0 1.0 | 原 MP3 的0.15–11.55秒，轻微首尾淡入淡出，24kHz单声道64kbps |
| `assets/handbrake.mp3` | Handbrake, activated #4，Joseph SARDIN & Axeline T. / BigSoundBank，https://bigsoundbank.com/handbrake-activated-4-s3103.html | CC0 1.0 | 去除开头静音，轻微淡入，24kHz单声道64kbps |
| `assets/departure.mp3` | Car, Starting and Departure，Joseph SARDIN / BigSoundBank，https://bigsoundbank.com/car-starting-and-departure-s0189.html | CC0 1.0 | 原MP3的4.5–8秒，响度归一、首尾淡化，24kHz单声道64kbps |

原始下载：`https://bigsoundbank.com/UPLOAD/mp3/1021.mp3`、`https://bigsoundbank.com/UPLOAD/mp3/3103.mp3`、`https://bigsoundbank.com/UPLOAD/mp3/0189.mp3`。

许可原文：Creative Commons CC0 1.0 Universal，https://creativecommons.org/publicdomain/zero/1.0/ 。来源页面明确允许修改、再分发和商业使用，无强制署名要求；此处保留出处便于维护。

观察、开关、刹车、停车和未满足通行条件的短反馈由 `effects.ts` 使用 Web Audio 本地合成，是交互提示，不宣称为真实车辆录音。通行使用车辆驶离录音，尚未加载好时使用短合成提示；驻车制动使用录音，转向灯开启后循环使用录音，暂停、后台及离开页面停止；语音时降低音效音量。
