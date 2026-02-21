import { logger } from "@/utils/logger";

/**
 * 调用 OpenRouter API 进行音频转录
 * 使用支持 audio input 的模型将语音转为文字
 */
export async function transcribeAudio(
  base64Audio: string,
  format: string,
): Promise<string> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    throw new Error("MODEL_API_KEY environment variable is required for transcription");
  }

  const baseUrl = process.env.MODEL_BASE_URL || "https://openrouter.ai/api/v1";
  const model = process.env.STT_MODEL_NAME || "google/gemini-2.0-flash-lite-001";

  logger.info(`[Transcribe] 开始转录音频, 格式: ${format}, 模型: ${model}`);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请将这段音频转录为文字。只输出转录的原始文字内容，不要添加任何额外的说明、标点修正或格式化。",
            },
            {
              type: "input_audio",
              input_audio: {
                data: base64Audio,
                format,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[Transcribe] OpenRouter API 错误: ${response.status} ${errorText}`);
    throw new Error(`Transcription API error: ${response.status} ${errorText}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  if (!result.choices?.[0]?.message?.content) {
    logger.error("[Transcribe] 转录结果为空", JSON.stringify(result));
    throw new Error("Transcription returned empty result");
  }

  const transcribedText = result.choices[0].message.content.trim();
  logger.info(`[Transcribe] 转录完成, 文字长度: ${transcribedText.length}`);

  return transcribedText;
}
