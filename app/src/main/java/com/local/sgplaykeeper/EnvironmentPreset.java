package com.local.sgplaykeeper;

enum EnvironmentPreset {
    POWER_SAVER("power_saver", "省电", 2),
    BALANCED("balanced", "均衡（推荐）", 4),
    HIGH_PERFORMANCE("high_performance", "高性能", 8);

    final String id;
    final String label;
    final int residentLimit;

    EnvironmentPreset(String id, String label, int residentLimit) {
        this.id = id;
        this.label = label;
        this.residentLimit = residentLimit;
    }

    static EnvironmentPreset fromId(String id, boolean legacyHighPerformance) {
        if (id != null) {
            for (EnvironmentPreset preset : values()) {
                if (preset.id.equals(id)) return preset;
            }
        }
        return legacyHighPerformance ? HIGH_PERFORMANCE : BALANCED;
    }

    static String[] labels() {
        EnvironmentPreset[] presets = values();
        String[] result = new String[presets.length];
        for (int i = 0; i < presets.length; i++) result[i] = presets[i].label;
        return result;
    }
}
