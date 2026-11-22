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

    @Test public void comparesVersionsForUpgradeAndDowngradePrompts() {
        AutomationManifest one = AutomationManifest.parse(VALID);
        AutomationManifest two = AutomationManifest.parse(VALID.replace("1.0.0", "2.0.0"));
        AutomationManifest preview = AutomationManifest.parse(VALID.replace("1.0.0", "2.0.0-rc1"));
        assertTrue(two.compareVersion(one) > 0);
        assertTrue(one.compareVersion(two) < 0);
        assertTrue(preview.compareVersion(two) < 0);
    }

    @Test public void parsesValidatedReadOnlyWorkflow() {
        String workflow = VALID.substring(0, VALID.length() - 1)
                + ",\"workflow\":{\"steps\":["
                + "{\"id\":\"title\",\"action\":\"readTitle\"},"
                + "{\"id\":\"wait\",\"action\":\"waitFor\",\"selector\":\"main\"},"
                + "{\"id\":\"log\",\"action\":\"writeSanitizedLog\",\"message\":\"done\"}]}}";
        AutomationManifest manifest = AutomationManifest.parse(workflow);
        assertNotNull(manifest.workflow);
        assertEquals(3, manifest.workflow.steps.size());
        assertTrue(manifest.canonicalJson.contains("\"timeoutMs\":5000"));
    }

    @Test public void rejectsUnsupportedActionAndMissingCapability() {
        assertWorkflowRejected("{\"id\":\"click\",\"action\":\"click\",\"selector\":\"button\"}");
        String noTextCapability = VALID.replace(",\"dom.wait\"", "")
                .substring(0, VALID.replace(",\"dom.wait\"", "").length() - 1)
                + ",\"workflow\":{\"steps\":[{\"id\":\"wait\",\"action\":\"waitFor\",\"selector\":\"main\"}]}}";
        assertThrows(IllegalArgumentException.class,
                () -> AutomationManifest.parse(noTextCapability));
    }

    @Test public void rejectsDuplicateIdsBadTimeoutAndMissingFields() {
        assertWorkflowRejected("{\"id\":\"same\",\"action\":\"readTitle\"},"
                + "{\"id\":\"same\",\"action\":\"readTitle\"}");
        assertWorkflowRejected("{\"id\":\"wait\",\"action\":\"waitFor\","
                + "\"selector\":\"main\",\"timeoutMs\":30001}");
        assertWorkflowRejected("{\"id\":\"read\",\"action\":\"readText\"}");
    }

    @Test public void rejectsMoreThanFiftyStepsAndUnsafeLogTemplate() {
        StringBuilder steps = new StringBuilder();
        for (int i = 0; i <= AutomationWorkflow.MAX_STEPS; i++) {
            if (i > 0) steps.append(',');
            steps.append("{\"id\":\"s").append(i).append("\",\"action\":\"readTitle\"}");
        }
        assertWorkflowRejected(steps.toString());
        assertWorkflowRejected("{\"id\":\"log\",\"action\":\"writeSanitizedLog\","
                + "\"message\":\"token={{secret}}\"}");
    }

    private static void assertWorkflowRejected(String steps) {
        String manifest = VALID.substring(0, VALID.length() - 1)
                + ",\"workflow\":{\"steps\":[" + steps + "]}}";
        assertThrows(IllegalArgumentException.class, () -> AutomationManifest.parse(manifest));
    }
}
