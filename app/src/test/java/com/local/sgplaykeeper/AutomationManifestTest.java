package com.local.sgplaykeeper;

import org.junit.Test;
import static org.junit.Assert.*;

public final class AutomationManifestTest {
    private static final String VALID = "{"
            + "\"id\":\"io.example.readonly\",\"name\":\"只读检查\",\"version\":\"1.0.0\","
            + "\"allowedOrigins\":[\"https://example.test\"],"
            + "\"capabilities\":[\"page.title.read\",\"dom.wait\",\"log.sanitized\"]}";

    @Test public void parsesReadOnlyManifestAndMatchesExactOrigin() {
        AutomationManifest manifest = AutomationManifest.parse(VALID);
        assertEquals("io.example.readonly", manifest.id);
        assertTrue(manifest.supportsUrl("https://example.test/path"));
        assertFalse(manifest.supportsUrl("http://example.test/path"));
        assertFalse(manifest.supportsUrl("https://sub.example.test/path"));
        assertFalse(manifest.toDescriptor().enabled);
    }

    @Test public void rejectsWriteCapabilityAndBuiltInNamespace() {
        assertThrows(IllegalArgumentException.class, () -> AutomationManifest.parse(
                VALID.replace("page.title.read", "dom.click")));
        assertThrows(IllegalArgumentException.class, () -> AutomationManifest.parse(
                VALID.replace("io.example.readonly", "com.playkeeper.custom")));
    }
}
