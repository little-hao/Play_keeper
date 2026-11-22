package com.local.sgplaykeeper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

final class AutomationManifest {
    private static final Set<String> READ_ONLY_CAPABILITIES = Set.of(
            "page.title.read", "dom.wait", "dom.text.read", "log.sanitized");

    final String id;
    final String name;
    final String version;
    final List<String> allowedOrigins;
    final List<String> capabilities;
    final AutomationWorkflow workflow;
    final String canonicalJson;

    private AutomationManifest(String id, String name, String version,
                               List<String> allowedOrigins, List<String> capabilities,
                               AutomationWorkflow workflow, String canonicalJson) {
        this.id = id;
        this.name = name;
        this.version = version;
        this.allowedOrigins = List.copyOf(allowedOrigins);
        this.capabilities = List.copyOf(capabilities);
        this.workflow = workflow;
        this.canonicalJson = canonicalJson;
    }

    static AutomationManifest parse(String raw) {
        try {
            JSONObject json = new JSONObject(raw);
            String id = required(json, "id", 80);
            if (!id.matches("[a-z][a-z0-9]*(?:[._-][a-z0-9]+){2,}")) {
                throw new IllegalArgumentException("脚本 ID 必须是至少三段的小写稳定标识");
            }
            if (id.startsWith("com.playkeeper.")) {
                throw new IllegalArgumentException("自定义脚本不能使用 Play Keeper 内置 ID 空间");
            }
            String name = required(json, "name", 60);
            String version = required(json, "version", 32);
            if (!version.matches("\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9.-]+)?")) {
                throw new IllegalArgumentException("脚本版本必须使用语义化版本格式");
            }
            List<String> origins = stringArray(json, "allowedOrigins", 8);
            List<String> normalizedOrigins = new ArrayList<>();
            for (String origin : origins) normalizedOrigins.add(normalizeOrigin(origin));
            List<String> capabilities = stringArray(json, "capabilities", 8);
            if (capabilities.isEmpty()) throw new IllegalArgumentException("脚本必须声明至少一项能力");
            for (String capability : capabilities) {
                if (!READ_ONLY_CAPABILITIES.contains(capability)) {
                    throw new IllegalArgumentException("当前阶段不允许的脚本能力：" + capability);
                }
            }
            AutomationWorkflow workflow = json.has("workflow")
                    ? AutomationWorkflow.parse(json.getJSONObject("workflow"), Set.copyOf(capabilities))
                    : null;
            JSONObject canonical = new JSONObject();
            canonical.put("id", id);
            canonical.put("name", name);
            canonical.put("version", version);
            canonical.put("allowedOrigins", new JSONArray(normalizedOrigins));
            canonical.put("capabilities", new JSONArray(capabilities));
            if (workflow != null) canonical.put("workflow", workflow.canonicalJson);
            return new AutomationManifest(id, name, version, normalizedOrigins,
                    capabilities, workflow, canonical.toString());
        } catch (JSONException error) {
            throw new IllegalArgumentException("脚本清单不是有效 JSON", error);
        }
    }

    boolean supportsUrl(String url) {
        String origin;
        try { origin = normalizeOrigin(url); }
        catch (IllegalArgumentException ignored) { return false; }
        return allowedOrigins.contains(origin);
    }

    AutomationPackageDescriptor toDescriptor() {
        return new AutomationPackageDescriptor(id, name, version,
                String.join(", ", allowedOrigins), capabilityLabels(), false, false, true);
    }

    int compareVersion(AutomationManifest other) {
        String[] left = version.split("[-+]", 2)[0].split("\\.");
        String[] right = other.version.split("[-+]", 2)[0].split("\\.");
        for (int i = 0; i < 3; i++) {
            int compared = Integer.compare(Integer.parseInt(left[i]), Integer.parseInt(right[i]));
            if (compared != 0) return compared;
        }
        boolean leftPre = version.contains("-");
        boolean rightPre = other.version.contains("-");
        if (leftPre != rightPre) return leftPre ? -1 : 1;
        return version.compareTo(other.version);
    }

    private List<String> capabilityLabels() {
        List<String> labels = new ArrayList<>();
        for (String capability : capabilities) {
            switch (capability) {
                case "page.title.read": labels.add("读取标题"); break;
                case "dom.wait": labels.add("等待元素"); break;
                case "dom.text.read": labels.add("读取文本"); break;
                case "log.sanitized": labels.add("脱敏日志"); break;
                default: labels.add(capability);
            }
        }
        return labels;
    }

    private static String normalizeOrigin(String value) {
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            if (!("http".equals(scheme) || "https".equals(scheme)) || uri.getHost() == null
                    || uri.getUserInfo() != null) {
                throw new IllegalArgumentException("允许来源必须是 HTTP/HTTPS origin");
            }
            int port = uri.getPort();
            String authority = uri.getHost().toLowerCase() + (port >= 0 ? ":" + port : "");
            return scheme + "://" + authority;
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("允许来源格式无效：" + value);
        }
    }

    private static String required(JSONObject json, String key, int maxLength) throws JSONException {
        String value = json.getString(key).trim();
        if (value.isEmpty() || value.length() > maxLength) {
            throw new IllegalArgumentException(key + " 不能为空且长度不能超过 " + maxLength);
        }
        return value;
    }

    private static List<String> stringArray(JSONObject json, String key, int maxItems)
            throws JSONException {
        JSONArray array = json.getJSONArray(key);
        if (array.length() == 0 || array.length() > maxItems) {
            throw new IllegalArgumentException(key + " 数量必须为 1–" + maxItems);
        }
        List<String> values = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            String value = array.getString(i).trim();
            if (value.isEmpty() || values.contains(value)) {
                throw new IllegalArgumentException(key + " 包含空值或重复值");
            }
            values.add(value);
        }
        return values;
    }
}
