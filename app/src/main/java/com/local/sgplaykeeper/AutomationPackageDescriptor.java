package com.local.sgplaykeeper;

import java.util.List;

final class AutomationPackageDescriptor {
    final String id;
    final String name;
    final String version;
    final String origin;
    final List<String> capabilities;
    final boolean enabled;
    final boolean configurable;

    AutomationPackageDescriptor(String id, String name, String version, String origin,
                                List<String> capabilities, boolean enabled,
                                boolean configurable) {
        this.id = id;
        this.name = name;
        this.version = version;
        this.origin = origin;
        this.capabilities = List.copyOf(capabilities);
        this.enabled = enabled;
        this.configurable = configurable;
    }

    String capabilitySummary() {
        return String.join(" · ", capabilities);
    }
}
