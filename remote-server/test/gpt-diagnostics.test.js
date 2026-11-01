import assert from "node:assert/strict";
import test from "node:test";
import { GptDiagnosticAdvisor } from "../gpt-diagnostics.js";

test("GPT diagnostics sends redacted screenshot and returns suggestions only", async () => {
  let request;
  const advisor = new GptDiagnosticAdvisor({ apiKey: "test-key", model: "test-model",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, async json() { return { output_text: JSON.stringify({
        category: "network", confidence: 0.9, summary: "设备短暂断线",
        evidence: ["断线事件"], recommendation: "等待设备重连并核对本地账本",
        safeAction: "WAIT_RECONNECT", requiresHuman: false
      }) }; } };
    } });
  const result = await advisor.analyze({ plan: { token: "secret", eventLedger: [] },
    screenshot: { mime: "image/jpeg", imageBase64: "AA==" } });
  assert.equal(result.suggestionOnly, true);
  assert.equal(result.safeAction, "WAIT_RECONNECT");
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.body.store, false);
  const serialized = JSON.stringify(request.body);
  assert.doesNotMatch(serialized, /secret/);
  assert.match(serialized, /data:image\/jpeg;base64,AA==/);
});

test("GPT diagnostics remains safely disabled without a server API key", async () => {
  const result = await new GptDiagnosticAdvisor({ apiKey: "" }).analyze({ plan: {} });
  assert.equal(result.enabled, false);
  assert.equal(result.safeAction, "NONE");
});
