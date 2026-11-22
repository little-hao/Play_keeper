package com.local.sgplaykeeper;

import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

public final class ReadOnlyWorkflowRunnerTest {
    @Test public void replaysAllReadOnlyActionsInOrder() {
        AutomationManifest manifest = manifest(
                "{\"id\":\"title\",\"action\":\"readTitle\"},"
                + "{\"id\":\"wait\",\"action\":\"waitFor\",\"selector\":\"main\"},"
                + "{\"id\":\"read\",\"action\":\"readText\",\"selector\":\"h1\"},"
                + "{\"id\":\"assert\",\"action\":\"assertText\",\"selector\":\"h1\",\"expectedText\":\"Hello\"},"
                + "{\"id\":\"log\",\"action\":\"writeSanitizedLog\",\"message\":\"done\"}");
        FakeBridge bridge = new FakeBridge();
        bridge.responses.add(ok("Page"));
        bridge.responses.add(ok(""));
        bridge.responses.add(ok("Hello"));
        bridge.responses.add(ok("Hello"));
        AtomicReference<ReadOnlyWorkflowRunner.Result> completed = new AtomicReference<>();

        new ReadOnlyWorkflowRunner(manifest, bridge, completed::set).start();

        assertNotNull(completed.get());
        assertTrue(completed.get().passed);
        assertEquals(5, completed.get().steps.size());
        assertEquals(4, bridge.scripts.size());
        assertTrue(bridge.scripts.get(0).contains("document.title"));
        assertFalse(bridge.scripts.get(0).contains("cookie"));
    }

    @Test public void stopsOnReadFailure() {
        AutomationManifest manifest = manifest(
                "{\"id\":\"read\",\"action\":\"readText\",\"selector\":\"h1\"},"
                + "{\"id\":\"title\",\"action\":\"readTitle\"}");
        FakeBridge bridge = new FakeBridge();
        bridge.responses.add(error("未找到元素"));
        AtomicReference<ReadOnlyWorkflowRunner.Result> completed = new AtomicReference<>();

        new ReadOnlyWorkflowRunner(manifest, bridge, completed::set).start();

        assertFalse(completed.get().passed);
        assertEquals(1, completed.get().steps.size());
        assertEquals("未找到元素", completed.get().steps.get(0).detail);
    }

    @Test public void refusesUnauthorizedOriginAndStopsAfterNavigation() {
        AutomationManifest manifest = manifest(
                "{\"id\":\"title\",\"action\":\"readTitle\"},"
                + "{\"id\":\"read\",\"action\":\"readText\",\"selector\":\"h1\"}");
        FakeBridge unauthorized = new FakeBridge();
        unauthorized.url = "https://other.test/";
        AtomicReference<ReadOnlyWorkflowRunner.Result> refused = new AtomicReference<>();
        new ReadOnlyWorkflowRunner(manifest, unauthorized, refused::set).start();
        assertFalse(refused.get().passed);
        assertTrue(unauthorized.scripts.isEmpty());

        FakeBridge navigated = new FakeBridge();
        navigated.responses.add(ok("Page"));
        navigated.navigateAfterEvaluation = true;
        AtomicReference<ReadOnlyWorkflowRunner.Result> stopped = new AtomicReference<>();
        new ReadOnlyWorkflowRunner(manifest, navigated, stopped::set).start();
        assertFalse(stopped.get().passed);
        assertEquals(1, stopped.get().steps.size());
    }

    private static AutomationManifest manifest(String steps) {
        return AutomationManifest.parse("{\"id\":\"io.example.readonly\","
                + "\"name\":\"test\",\"version\":\"1.0.0\","
                + "\"allowedOrigins\":[\"https://example.test\"],"
                + "\"capabilities\":[\"page.title.read\",\"dom.wait\","
                + "\"dom.text.read\",\"log.sanitized\"],"
                + "\"workflow\":{\"steps\":[" + steps + "]}}");
    }

    private static String ok(String value) {
        return JSONObject.quote("{\"ok\":true,\"value\":" + JSONObject.quote(value) + "}");
    }

    private static String error(String value) {
        return JSONObject.quote("{\"ok\":false,\"error\":" + JSONObject.quote(value) + "}");
    }

    private static final class FakeBridge implements ReadOnlyWorkflowRunner.Bridge {
        String url = "https://example.test/page";
        boolean navigateAfterEvaluation;
        final List<String> scripts = new ArrayList<>();
        final List<String> responses = new ArrayList<>();

        @Override public String currentUrl() { return url; }

        @Override public void evaluateJavascript(String script,
                                                 ReadOnlyWorkflowRunner.EvaluationCallback callback) {
            scripts.add(script);
            String response = responses.remove(0);
            if (navigateAfterEvaluation) url = "https://example.test/next";
            callback.onResult(response);
        }

        @Override public void postDelayed(Runnable action, long delayMs) { action.run(); }
    }
}
