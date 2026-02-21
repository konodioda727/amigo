import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "@/utils/toast";

export type VoiceRecorderStatus = "idle" | "recording" | "transcribing";

const TRANSCRIBE_API_URL = "http://localhost:10013/api/transcribe";
const MAX_RECORDING_SECONDS = 60;

export function useVoiceRecorder() {
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理定时器
  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  // 清理媒体流
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  // 将 Blob 转为 base64
  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // 去掉 data:audio/webm;base64, 前缀
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  // 发送音频到服务端进行转录
  const sendForTranscription = useCallback(
    async (audioBlob: Blob): Promise<string> => {
      const base64Audio = await blobToBase64(audioBlob);

      // 根据 MIME 类型确定格式
      const mimeType = audioBlob.type;
      let format = "webm";
      if (mimeType.includes("ogg")) format = "ogg";
      else if (mimeType.includes("mp4") || mimeType.includes("m4a")) format = "m4a";
      else if (mimeType.includes("wav")) format = "wav";
      else if (mimeType.includes("webm")) format = "webm";

      const response = await fetch(TRANSCRIBE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ audio: base64Audio, format }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || `Transcription failed: ${response.status}`);
      }

      const data = (await response.json()) as { text: string };
      return data.text;
    },
    [blobToBase64],
  );

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 选择浏览器支持的 MIME 类型
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
            ? "audio/ogg;codecs=opus"
            : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // 每 100ms 收集一次数据
      setStatus("recording");
      setRecordingDuration(0);

      // 录音计时器
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // 最大录音时长限制
      maxTimerRef.current = setTimeout(() => {
        toast.warning(`录音已达到最大时长 ${MAX_RECORDING_SECONDS} 秒`);
        stopRecording();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (error: any) {
      console.error("[VoiceRecorder] 获取麦克风权限失败:", error);
      if (error.name === "NotAllowedError") {
        toast.error("麦克风权限被拒绝，请在浏览器设置中允许访问麦克风");
      } else if (error.name === "NotFoundError") {
        toast.error("未检测到麦克风设备");
      } else {
        toast.error("无法启动录音: " + error.message);
      }
      setStatus("idle");
    }
  }, []);

  // 停止录音并返回转录文字
  const stopRecording = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        setStatus("idle");
        resolve("");
        return;
      }

      clearTimers();

      mediaRecorder.onstop = async () => {
        cleanupStream();

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });
        audioChunksRef.current = [];

        // 检查音频是否太短
        if (audioBlob.size < 1000) {
          toast.warning("录音时间太短，请重试");
          setStatus("idle");
          setRecordingDuration(0);
          resolve("");
          return;
        }

        setStatus("transcribing");

        try {
          const text = await sendForTranscription(audioBlob);
          setStatus("idle");
          setRecordingDuration(0);
          resolve(text);
        } catch (error: any) {
          console.error("[VoiceRecorder] 转录失败:", error);
          toast.error("语音转录失败: " + error.message);
          setStatus("idle");
          setRecordingDuration(0);
          reject(error);
        }
      };

      mediaRecorder.stop();
    });
  }, [clearTimers, cleanupStream, sendForTranscription]);

  // 取消录音
  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    clearTimers();
    cleanupStream();
    audioChunksRef.current = [];
    setStatus("idle");
    setRecordingDuration(0);
  }, [clearTimers, cleanupStream]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cancelRecording();
    };
  }, [cancelRecording]);

  // 格式化录音时长
  const formattedDuration = `${String(Math.floor(recordingDuration / 60)).padStart(2, "0")}:${String(recordingDuration % 60).padStart(2, "0")}`;

  return {
    status,
    recordingDuration,
    formattedDuration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
