package com.local.sgplaykeeper;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Pure URL policy shared by the UI and unit tests. */
final class InstanceUrlPolicy {
    private static final String LEGACY_HOST = "sgplay.cc";
    private InstanceUrlPolicy() {}

    static String normalizeStartUrl(String value, String fallback) {
        String candidate = value == null ? "" : value.trim();
        if (candidate.isEmpty()) return fallback;
        URI uri = parse(candidate);
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("自定义首页必须是有效的 HTTPS 地址");
        }
        return uri.toString();
    }

    static boolean isAllowed(String candidate, String configuredStartUrl) {
        URI uri = parse(candidate);
        if (uri == null || uri.getHost() == null) return false;
        String scheme = lower(uri.getScheme());
        String host = lower(uri.getHost());
        if (!("http".equals(scheme) || "https".equals(scheme))) return false;
        if (LEGACY_HOST.equals(host) || host.endsWith("." + LEGACY_HOST)) return true;
        URI configured = parse(configuredStartUrl);
        return configured != null && "https".equals(scheme)
                && "https".equals(lower(configured.getScheme()))
                && host.equals(lower(configured.getHost()))
                && effectivePort(uri) == effectivePort(configured);
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static URI parse(String value) {
        if (value == null || value.isBlank()) return null;
        try { return new URI(value); }
        catch (URISyntaxException ignored) { return null; }
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
