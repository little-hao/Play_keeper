package com.local.sgplaykeeper;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.ArrayList;
import java.util.List;

final class ReadOnlyWorkflowRunner {
    interface Bridge {
        String currentUrl();
        void evaluateJavascript(String script, EvaluationCallback callback);
        void postDelayed(Runnable action, long delayMs);
    }

    interface EvaluationCallback { void onResult(String rawResult); }
    interface CompletionCallback { void onComplete(Result result); }

    static final class StepResult {
        final String id;
        final String action;
        final boolean passed;
        final String detail;

        StepResult(String id, String action, boolean passed, String detail) {
            this.id = id;
            this.action = action;
            this.passed = passed;
            this.detail = detail;
        }
    }

    static final class Result {
        final boolean passed;
        final String message;
        final List<StepResult> steps;

        Result(boolean passed, String message, List<StepResult> steps) {
            this.passed = passed;
            this.message = message;
            this.steps = List.copyOf(steps);
        }
    }

    private static final long POLL_INTERVAL_MS = 250;
    private final AutomationManifest manifest;
    private final Bridge bridge;
    private final CompletionCallback completion;
    private final List<StepResult> results = new ArrayList<>();
    private final String initialUrl;
    private boolean finished;

    ReadOnlyWorkflowRunner(AutomationManifest manifest, Bridge bridge,
                           CompletionCallback completion) {
        this.manifest = manifest;
        this.bridge = bridge;
        this.completion = completion;
        this.initialUrl = bridge.currentUrl();
    }

    void start() {
        if (manifest.workflow == null) {
            finish(false, "脚本没有 workflow");
        } else if (!manifest.supportsUrl(initialUrl)) {
            finish(false, "当前页面来源不在脚本授权范围内");
        } else {
            runStep(0);
        }
    }

    private void runStep(int index) {
        if (finished) return;
        if (!initialUrl.equals(bridge.currentUrl())) {
            finish(false, "执行期间页面发生跳转，已停止");
            return;
        }
        if (index >= manifest.workflow.steps.size()) {
            finish(true, "只读流程执行完成");
            return;
        }
        AutomationWorkflow.Step step = manifest.workflow.steps.get(index);
        if ("writeSanitizedLog".equals(step.action)) {
            addAndContinue(index, step, true, step.canonicalJson.optString("message"));
            return;
        }
        if ("waitFor".equals(step.action)) {
            pollWaitFor(index, step, System.currentTimeMillis());
            return;
        }
        evaluate(index, step, scriptFor(step));
    }

    private void pollWaitFor(int index, AutomationWorkflow.Step step, long startedAt) {
        if (!initialUrl.equals(bridge.currentUrl())) {
            finish(false, "执行期间页面发生跳转，已停止");
            return;
        }
        bridge.evaluateJavascript(queryScript(step.canonicalJson.optString("selector")), raw -> {
            Evaluation value = decode(raw);
            if (value.ok) {
                addAndContinue(index, step, true, "已找到元素");
                return;
            }
            int timeout = step.canonicalJson.optInt("timeoutMs", 5_000);
            if (System.currentTimeMillis() - startedAt >= timeout) {
                failStep(step, value.detail.isEmpty() ? "等待元素超时" : value.detail);
            } else {
                bridge.postDelayed(() -> pollWaitFor(index, step, startedAt), POLL_INTERVAL_MS);
            }
        });
    }

    private void evaluate(int index, AutomationWorkflow.Step step, String script) {
        bridge.evaluateJavascript(script, raw -> {
            Evaluation value = decode(raw);
            if (!value.ok) {
                failStep(step, value.detail);
            } else {
                addAndContinue(index, step, true, value.detail);
            }
        });
    }

    private void addAndContinue(int index, AutomationWorkflow.Step step,
                                boolean passed, String detail) {
        results.add(new StepResult(step.id, step.action, passed, limit(detail)));
        runStep(index + 1);
    }

    private void failStep(AutomationWorkflow.Step step, String detail) {
        results.add(new StepResult(step.id, step.action, false, limit(detail)));
        finish(false, "步骤 " + step.id + " 失败");
    }

    private void finish(boolean passed, String message) {
        if (finished) return;
        finished = true;
        completion.onComplete(new Result(passed, message, results));
    }

    private static String scriptFor(AutomationWorkflow.Step step) {
        switch (step.action) {
            case "readTitle":
                return "(()=>JSON.stringify({ok:true,value:String(document.title||'').slice(0,500)}))()";
            case "readText":
                return textScript(step.canonicalJson.optString("selector"), null);
            case "assertText":
                return textScript(step.canonicalJson.optString("selector"),
                        step.canonicalJson.optString("expectedText"));
            default:
                throw new IllegalArgumentException("不支持的只读动作：" + step.action);
        }
    }

    private static String queryScript(String selector) {
        return "(()=>{try{const e=document.querySelector(" + JSONObject.quote(selector)
                + ");return JSON.stringify(e?{ok:true}:{ok:false,error:'尚未找到元素'});"
                + "}catch(e){return JSON.stringify({ok:false,error:'选择器无效'});}})()";
    }

    private static String textScript(String selector, String expected) {
        String comparison = expected == null
                ? "return JSON.stringify({ok:true,value:v});"
                : "return JSON.stringify(v===" + JSONObject.quote(expected)
                + "?{ok:true,value:v}:{ok:false,error:'文本断言不匹配'});";
        return "(()=>{try{const e=document.querySelector(" + JSONObject.quote(selector)
                + ");if(!e)return JSON.stringify({ok:false,error:'未找到元素'});"
                + "const v=String(e.textContent||'').trim().slice(0,500);" + comparison
                + "}catch(e){return JSON.stringify({ok:false,error:'选择器无效'});}})()";
    }

    private static Evaluation decode(String raw) {
        try {
            Object outer = new JSONTokener(raw == null ? "null" : raw).nextValue();
            JSONObject value = outer instanceof String
                    ? new JSONObject((String) outer) : (JSONObject) outer;
            boolean ok = value.optBoolean("ok", false);
            String detail = ok ? value.optString("value", "")
                    : value.optString("error", "网页返回了无效结果");
            return new Evaluation(ok, detail);
        } catch (JSONException | ClassCastException error) {
            return new Evaluation(false, "无法解析网页只读结果");
        }
    }

    private static String limit(String value) {
        if (value == null) return "";
        return value.length() <= 500 ? value : value.substring(0, 500);
    }

    private static final class Evaluation {
        final boolean ok;
        final String detail;
        Evaluation(boolean ok, String detail) { this.ok = ok; this.detail = detail; }
    }
}
