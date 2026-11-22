package com.local.sgplaykeeper;

import org.junit.Test;

import static org.junit.Assert.*;

public final class AutomationPackageRegistryTest {
    @Test public void legacyAdapterRemainsEnabledAndConfigurable() {
        AutomationPackageDescriptor descriptor = AutomationPackageRegistry.find(
                "com.playkeeper.sgplay.legacy");
        assertNotNull(descriptor);
        assertTrue(descriptor.enabled);
        assertTrue(descriptor.configurable);
        assertTrue(descriptor.origin.contains("sgplay.cc"));
    }

    @Test public void exampleStartsDisabledAndReadOnly() {
        AutomationPackageDescriptor descriptor = AutomationPackageRegistry.find(
                "com.playkeeper.example.readonly");
        assertNotNull(descriptor);
        assertFalse(descriptor.enabled);
        assertFalse(descriptor.configurable);
        assertFalse(descriptor.capabilities.contains("点击与输入"));
    }
}
