package com.local.sgplaykeeper;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class EnvironmentPresetTest {
    @Test public void supportsSixteenResidentInstances() {
        assertEquals(16, EnvironmentPreset.MAXIMUM.residentLimit);
        assertEquals(EnvironmentPreset.MAXIMUM,
                EnvironmentPreset.fromId("maximum", false));
    }

    @Test public void migratesLegacyPerformancePreference() {
        assertEquals(EnvironmentPreset.HIGH_PERFORMANCE,
                EnvironmentPreset.fromId(null, true));
        assertEquals(EnvironmentPreset.BALANCED,
                EnvironmentPreset.fromId(null, false));
    }
}
