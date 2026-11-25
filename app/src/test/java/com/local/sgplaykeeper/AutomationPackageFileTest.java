package com.local.sgplaykeeper;

import org.junit.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.*;

public final class AutomationPackageFileTest {
    private static final String MANIFEST = "{"
            + "\"id\":\"io.example.portable\",\"name\":\"可移植只读脚本\",\"version\":\"1.2.3\","
            + "\"allowedOrigins\":[\"https://example.test\"],"
            + "\"capabilities\":[\"page.title.read\",\"dom.wait\"],"
            + "\"workflow\":{\"steps\":[{\"id\":\"title\",\"action\":\"readTitle\"}]}}";

    @Test public void exportsAndImportsPortablePackage() {
        AutomationManifest original = AutomationManifest.parse(MANIFEST);
        byte[] bytes = AutomationPackageFile.create(original);

        assertTrue(AutomationPackageFile.looksLikePackage(bytes));
        AutomationManifest restored = AutomationPackageFile.parse(bytes);
        assertEquals(original.id, restored.id);
        assertEquals(original.version, restored.version);
        assertEquals(original.canonicalJson, restored.canonicalJson);
    }

    @Test public void rejectsJsonAndDamagedZip() {
        byte[] json = MANIFEST.getBytes(StandardCharsets.UTF_8);
        assertFalse(AutomationPackageFile.looksLikePackage(json));
        assertThrows(IllegalArgumentException.class,
                () -> AutomationPackageFile.parse(new byte[]{'P', 'K', 3, 4, 0, 1, 2}));
    }

    @Test public void enforcesPackageSizeLimit() {
        assertThrows(IllegalArgumentException.class, () -> AutomationPackageFile.parse(
                new byte[AutomationPackageFile.MAX_PACKAGE_BYTES + 1]));
    }
}
