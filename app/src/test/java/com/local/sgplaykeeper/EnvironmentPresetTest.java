package com.local.sgplaykeeper;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public final class EnvironmentPresetTest {
    @Test public void exposesExpectedResidentLimits() {
        assertEquals(2, EnvironmentPreset.POWER_SAVER.residentLimit);
        assertEquals(4, EnvironmentPreset.BALANCED.residentLimit);
        assertEquals(8, EnvironmentPreset.HIGH_PERFORMANCE.residentLimit);
    }

    @Test public void migratesLegacyHighPerformanceFlag() {
        assertEquals(EnvironmentPreset.HIGH_PERFORMANCE,
                EnvironmentPreset.fromId(null, true));
        assertEquals(EnvironmentPreset.BALANCED,
                EnvironmentPreset.fromId(null, false));
        assertEquals(EnvironmentPreset.POWER_SAVER,
                EnvironmentPreset.fromId("power_saver", true));
    }
}
