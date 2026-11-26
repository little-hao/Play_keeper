package com.local.sgplaykeeper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

final class AutomationWorkflow {
    static final int MAX_STEPS = 50;
    private static final int MAX_SELECTOR_LENGTH = 300;
    private static final int MAX_TEXT_LENGTH = 500;
    private static final int MAX_URL_LENGTH = 2_000;

    final List<Step> steps;
    final JSONObject canonicalJson;

    private AutomationWorkflow(List<Step> steps, JSONObject canonicalJson) {
        this.steps = List.copyOf(steps);
        this.canonicalJson = canonicalJson;
    }

    static AutomationWorkflow parse(JSONObject json, Set<String> declaredCapabilities)
            throws JSONException {
        rejectUnknownKeys(json, Set.of("steps"), "workflow");
        JSONArray rawSteps = json.getJSONArray("steps");
        if (rawSteps.length() == 0 || rawSteps.length() > MAX_STEPS) {
            throw new IllegalArgumentException("workflow.steps 数量必须为 1–" + MAX_STEPS);
        }
        List<Step> steps = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        JSONArray canonicalSteps = new JSONArray();
        for (int i = 0; i < rawSteps.length(); i++) {
            Step step = Step.parse(rawSteps.getJSONObject(i), declaredCapabilities);
            if (!ids.add(step.id)) {
                throw new IllegalArgumentException("workflow 包含重复步骤 ID：" + step.id);
            }
            steps.add(step);
            canonicalSteps.put(step.canonicalJson);
        }
        JSONObject canonical = new JSONObject();
        canonical.put("steps", canonicalSteps);
        return new AutomationWorkflow(steps, canonical);
    }

    private static void rejectUnknownKeys(JSONObject json, Set<String> allowed, String location) {
        Iterator<String> keys = json.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!allowed.contains(key)) {
                throw new IllegalArgumentException(location + " 包含未知字段：" + key);
            }
        }
    }

    static final class Step {
        final String id;
        final String action;
        final JSONObject canonicalJson;

        private Step(String id, String action, JSONObject canonicalJson) {
            this.id = id;
            this.action = action;
            this.canonicalJson = canonicalJson;
        }

        static Step parse(JSONObject json, Set<String> capabilities) throws JSONException {
            String id = requiredString(json, "id", 64);
            if (!id.matches("[a-z][a-z0-9_-]*")) {
                throw new IllegalArgumentException("步骤 ID 只能使用小写字母、数字、下划线和连字符");
            }
            String action = requiredString(json, "action", 40);
            JSONObject canonical = new JSONObject();
            canonical.put("id", id);
            canonical.put("action", action);
            switch (action) {
                case "readTitle":
                    rejectUnknownKeys(json, Set.of("id", "action"), "步骤 " + id);
                    requireCapability(capabilities, "page.title.read", action);
                    break;
                case "waitFor":
                    rejectUnknownKeys(json, Set.of("id", "action", "selector", "timeoutMs"), "步骤 " + id);
                    requireCapability(capabilities, "dom.wait", action);
                    canonical.put("selector", requiredSelector(json));
                    canonical.put("timeoutMs", timeout(json));
                    break;
                case "readText":
                    rejectUnknownKeys(json, Set.of("id", "action", "selector"), "步骤 " + id);
                    requireCapability(capabilities, "dom.text.read", action);
                    canonical.put("selector", requiredSelector(json));
                    break;
                case "assertText":
                    rejectUnknownKeys(json, Set.of("id", "action", "selector", "expectedText"), "步骤 " + id);
                    requireCapability(capabilities, "dom.text.read", action);
                    canonical.put("selector", requiredSelector(json));
                    canonical.put("expectedText", requiredString(json, "expectedText", MAX_TEXT_LENGTH));
                    break;
                case "writeSanitizedLog":
                    rejectUnknownKeys(json, Set.of("id", "action", "message"), "步骤 " + id);
                    requireCapability(capabilities, "log.sanitized", action);
                    String message = requiredString(json, "message", MAX_TEXT_LENGTH);
                    if (message.contains("{{") || message.contains("}}") || containsControl(message)) {
                        throw new IllegalArgumentException("脱敏日志当前只允许不含模板或控制字符的静态文本");
                    }
                    canonical.put("message", message);
                    break;
                case "click":
                    rejectUnknownKeys(json, Set.of("id", "action", "selector", "timeoutMs", "settleMs"), "步骤 " + id);
                    requireCapability(capabilities, "dom.click", action);
                    canonical.put("selector", requiredSelector(json));
                    canonical.put("timeoutMs", timeout(json));
                    int settleMs = json.has("settleMs") ? json.getInt("settleMs") : 500;
                    if (settleMs < 0 || settleMs > 5_000) {
                        throw new IllegalArgumentException("settleMs 必须在 0–5000 之间");
                    }
                    canonical.put("settleMs", settleMs);
                    break;
                case "navigate":
                    rejectUnknownKeys(json, Set.of("id", "action", "url", "timeoutMs"), "步骤 " + id);
                    requireCapability(capabilities, "same_origin.navigate", action);
                    String url = requiredString(json, "url", MAX_URL_LENGTH);
                    if (!(url.startsWith("http://") || url.startsWith("https://"))) {
                        throw new IllegalArgumentException("navigate.url 必须是完整 HTTP/HTTPS 地址");
                    }
                    canonical.put("url", url);
                    canonical.put("timeoutMs", timeout(json));
                    break;
                default:
                    throw new IllegalArgumentException("不支持的 workflow 动作：" + action);
            }
            return new Step(id, action, canonical);
        }

        private static String requiredSelector(JSONObject json) throws JSONException {
            String selector = requiredString(json, "selector", MAX_SELECTOR_LENGTH);
            if (containsControl(selector)) throw new IllegalArgumentException("selector 不能包含控制字符");
            return selector;
        }

        private static int timeout(JSONObject json) throws JSONException {
            int value = json.has("timeoutMs") ? json.getInt("timeoutMs") : 5_000;
            if (value < 100 || value > 30_000) {
                throw new IllegalArgumentException("timeoutMs 必须在 100–30000 之间");
            }
            return value;
        }

        private static void requireCapability(Set<String> capabilities, String capability, String action) {
            if (!capabilities.contains(capability)) {
                throw new IllegalArgumentException(action + " 未声明所需能力：" + capability);
            }
        }

        private static String requiredString(JSONObject json, String key, int maxLength)
                throws JSONException {
            String value = json.getString(key).trim();
            if (value.isEmpty() || value.length() > maxLength) {
                throw new IllegalArgumentException(key + " 不能为空且长度不能超过 " + maxLength);
            }
            return value;
        }

        private static boolean containsControl(String value) {
            for (int i = 0; i < value.length(); i++) {
                if (Character.isISOControl(value.charAt(i))) return true;
            }
            return false;
        }
    }
}
