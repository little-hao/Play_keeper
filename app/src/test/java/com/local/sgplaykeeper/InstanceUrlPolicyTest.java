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
}
