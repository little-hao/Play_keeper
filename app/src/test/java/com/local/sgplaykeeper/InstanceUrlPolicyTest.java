package com.local.sgplaykeeper;

import org.junit.Test;
import static org.junit.Assert.*;

public final class InstanceUrlPolicyTest {
    @Test public void keepsLegacyGameOrigins() {
        assertTrue(InstanceUrlPolicy.isAllowed("http://sgplay.cc/home.html", null));
        assertTrue(InstanceUrlPolicy.isAllowed("https://api.sgplay.cc/path", null));
        assertFalse(InstanceUrlPolicy.isAllowed("https://sgplay.cc.example/path", null));
    }

    @Test public void customInstanceIsRestrictedToExactHttpsOrigin() {
        String start = "https://example.test:8443/app";
        assertTrue(InstanceUrlPolicy.isAllowed("https://example.test:8443/next", start));
        assertFalse(InstanceUrlPolicy.isAllowed("https://example.test/next", start));
        assertFalse(InstanceUrlPolicy.isAllowed("http://example.test:8443/next", start));
        assertFalse(InstanceUrlPolicy.isAllowed("https://sub.example.test:8443/next", start));
    }

    @Test public void normalizesOnlyHttpsCustomStarts() {
        assertEquals("https://example.test/app",
                InstanceUrlPolicy.normalizeStartUrl(" https://example.test/app ", "fallback"));
        assertEquals("fallback", InstanceUrlPolicy.normalizeStartUrl("", "fallback"));
        assertThrows(IllegalArgumentException.class,
                () -> InstanceUrlPolicy.normalizeStartUrl("http://example.test", "fallback"));
        assertThrows(IllegalArgumentException.class,
                () -> InstanceUrlPolicy.normalizeStartUrl("https://user@example.test", "fallback"));
    }

    @Test public void httpRequiresExplicitOptInAndExactOrigin() {
        String start = InstanceUrlPolicy.normalizeStartUrl(
                "http://legacy.example.test:8080/app", "fallback", true);
        assertEquals("http://legacy.example.test:8080/app", start);
        assertTrue(InstanceUrlPolicy.isAllowed(
                "http://legacy.example.test:8080/next", start, true));
        assertFalse(InstanceUrlPolicy.isAllowed(
                "http://legacy.example.test:8080/next", start, false));
        assertFalse(InstanceUrlPolicy.isAllowed(
                "https://legacy.example.test:8080/next", start, true));
        assertFalse(InstanceUrlPolicy.isAllowed(
                "http://legacy.example.test/next", start, true));
        assertFalse(InstanceUrlPolicy.isAllowed(
                "http://sub.legacy.example.test:8080/next", start, true));
    }

    @Test public void completesMissingSchemeForLegacyAndHttpsSites() {
        assertEquals("http://sgplay.cc/AFK.html#/hang",
                InstanceUrlPolicy.suggestedStartUrl("sgplay.cc/AFK.html#/hang"));
        assertEquals("https://example.test/path",
                InstanceUrlPolicy.suggestedStartUrl("example.test/path"));
        assertEquals("https://example.test/path",
                InstanceUrlPolicy.suggestedStartUrl("https：//example.test/path"));
        assertEquals("http://sgplay.cc/home.html#/",
                InstanceUrlPolicy.normalizeStartUrl("sgplay.cc/home.html#/", "fallback", true));
        assertThrows(IllegalArgumentException.class, () ->
                InstanceUrlPolicy.normalizeStartUrl("sgplay.cc/home.html#/", "fallback", false));
    }
}
