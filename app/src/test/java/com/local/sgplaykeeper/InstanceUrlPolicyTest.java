package com.local.sgplaykeeper;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class InstanceUrlPolicyTest {
    @Test public void keepsLegacyGameOriginsAllowed() {
        assertTrue(InstanceUrlPolicy.isAllowed("http://sgplay.cc/AFK.html#/hang", "", false));
        assertTrue(InstanceUrlPolicy.isAllowed("https://api.sgplay.cc/path", "", false));
    }

    @Test public void allowsOnlyConfiguredCustomOrigin() {
        assertTrue(InstanceUrlPolicy.isAllowed("https://example.com/path",
                "https://example.com/start", false));
        assertFalse(InstanceUrlPolicy.isAllowed("https://other.example/path",
                "https://example.com/start", false));
    }

    @Test public void requiresExplicitOptInForHttp() {
        assertEquals("https://example.com/start", InstanceUrlPolicy.normalizeStartUrl(
                "https://example.com/start", "https://fallback.example", false));
        assertTrue(InstanceUrlPolicy.isAllowed("http://example.com/path",
                "http://example.com/start", true));
        assertFalse(InstanceUrlPolicy.isAllowed("http://example.com/path",
                "http://example.com/start", false));
    }
}
