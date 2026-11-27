package com.local.sgplaykeeper;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

final class InstanceUrlPolicy {
    private static final String LEGACY_HOST = "sgplay.cc";

    private InstanceUrlPolicy() {}

    static String normalizeStartUrl(String value, String fallback, boolean allowHttp) {
        String candidate = value == null ? "" : value.trim();
        if (candidate.isEmpty()) return fallback;
        URI uri = parse(candidate);
        String scheme = uri == null ? "" : lower(uri.getScheme());
        boolean acceptedScheme = "https".equals(scheme) || (allowHttp && "http".equals(scheme));
        if (uri == null || !acceptedScheme || uri.getHost() == null || uri.getUserInfo() != null) {
            throw new IllegalArgumentException(allowHttp
                    ? "自定义首页必须是有效的 HTTP 或 HTTPS 地址"
                    : "自定义首页必须是有效的 HTTPS 地址；使用 HTTP 需先明确允许");
        }
        return uri.toString();
    }

    static boolean isAllowed(String candidate, String configuredStartUrl, boolean allowHttp) {
        URI uri = parse(candidate);
        if (uri == null || uri.getHost() == null) return false;
        String scheme = lower(uri.getScheme());
        String host = lower(uri.getHost());
        if (!("http".equals(scheme) || "https".equals(scheme))) return false;
        if (LEGACY_HOST.equals(host) || host.endsWith("." + LEGACY_HOST)) return true;
        URI configured = parse(configuredStartUrl);
        String configuredScheme = configured == null ? "" : lower(configured.getScheme());
        boolean configuredSchemeAllowed = "https".equals(configuredScheme)
                || (allowHttp && "http".equals(configuredScheme));
        return configured != null && configuredSchemeAllowed
                && scheme.equals(configuredScheme)
                && host.equals(lower(configured.getHost()))
                && effectivePort(uri) == effectivePort(configured);
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static URI parse(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return new URI(value);
        } catch (URISyntaxException ignored) {
            return null;
        }
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
