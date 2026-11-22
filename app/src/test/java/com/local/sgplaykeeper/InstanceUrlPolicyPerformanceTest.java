package com.local.sgplaykeeper;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public final class InstanceUrlPolicyPerformanceTest {
    @Test
    public void navigationPolicyStaysCheapOnTheJvm() {
        String start = "https://example.test/app";
        long started = System.nanoTime();
        int accepted = 0;
        for (int i = 0; i < 100_000; i++) {
            if (InstanceUrlPolicy.isAllowed("https://example.test/page/" + i, start)) {
                accepted++;
            }
        }
        long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
        assertEquals(100_000, accepted);
        // Generous CI guardrail: catches accidental network/I/O or pathological parsing.
        assertTrue("URL policy took " + elapsedMs + " ms", elapsedMs < 2_000L);
    }
}
