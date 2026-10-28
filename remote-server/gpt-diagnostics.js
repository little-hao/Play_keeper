const DIAGNOSTIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "confidence", "summary", "evidence", "recommendation",
    "safeAction", "requiresHuman"],
  properties: {
    category: { type: "string", enum: ["network", "page_state", "automation_state",
      "market_state", "timeout", "unknown"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string", maxLength: 240 },
    evidence: { type: "array", maxItems: 8, items: { type: "string", maxLength: 240 } },
    recommendation: { type: "string", maxLength: 600 },
    safeAction: { type: "string", enum: ["NONE", "REFRESH_TELEMETRY",
      "RELOAD_CURRENT_PAGE", "WAIT_RECONNECT", "REQUEST_HUMAN"] },
    requiresHuman: { type: "boolean" }
  }
};

function safeJson(value, limit = 24_000) {
  const text = JSON.stringify(value, (key, item) => {
    if (/token|password|secret|authorization|cookie/i.test(key)) return "[REDACTED]";
    if (typeof item === "string" && item.length > 1_000) return `${item.slice(0, 1_000)}…`;
    return item;
  });
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function outputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

export class GptDiagnosticAdvisor {
  constructor({ apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_DIAGNOSTIC_MODEL || "gpt-5-mini",
    fetchImpl = globalThis.fetch, logger = console } = {}) {
    this.apiKey = String(apiKey || "").trim();
    this.model = String(model || "gpt-5-mini").trim();
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async analyze({ plan, devices = [], screenshot = null } = {}) {
    if (!this.apiKey || typeof this.fetchImpl !== "function") {
      return { enabled: false, category: "unknown", confidence: 0,
        summary: "GPT 诊断未启用", evidence: [],
        recommendation: "在 VPS 环境变量中配置 OPENAI_API_KEY 后可启用只读诊断。",
        safeAction: "NONE", requiresHuman: true, generatedAt: Date.now() };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const content = [{ type: "input_text", text:
        "你是 Play Keeper 运行诊断助手。仅分析原因并给出建议；禁止声称已执行任何操作，"
        + "禁止建议绕过交易确认。根据以下已脱敏事件账本、步骤账本和设备状态诊断接力卡顿：\n"
        + safeJson({ plan, devices }) }];
      if (screenshot?.mime === "image/jpeg" && typeof screenshot.imageBase64 === "string"
          && screenshot.imageBase64.length < 3_500_000) {
        content.push({ type: "input_image",
          image_url: `data:image/jpeg;base64,${screenshot.imageBase64}` });
      }
      const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({ model: this.model, store: false,
          input: [{ role: "user", content }],
          text: { format: { type: "json_schema", name: "play_keeper_diagnostic",
            strict: true, schema: DIAGNOSTIC_SCHEMA } } })
      });
      if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
      const payload = await response.json();
      const parsed = JSON.parse(outputText(payload));
      return { enabled: true, model: this.model, ...parsed, generatedAt: Date.now(),
        suggestionOnly: true };
    } catch (error) {
      this.logger.warn?.("GPT diagnostic failed", error?.message || error);
      return { enabled: true, model: this.model, category: "unknown", confidence: 0,
        summary: "GPT 诊断暂时不可用", evidence: [],
        recommendation: "请下载诊断包后人工核对；本次不会自动执行任何操作。",
        safeAction: "NONE", requiresHuman: true, generatedAt: Date.now(),
        error: String(error?.message || error).slice(0, 160), suggestionOnly: true };
    } finally {
      clearTimeout(timer);
    }
  }
}

export { DIAGNOSTIC_SCHEMA };
