package com.local.sgplaykeeper;

/**
 * Main-thread task identity. A callback belongs to one execution, not merely to a task name.
 * Advancing invalidates callbacks even if the next execution uses the same task type.
 */
final class AutomationEpoch {
    private long value;

    long current() {
        return value;
    }

    void advance() {
        value++;
    }

    boolean isCurrent(long captured) {
        return captured == value;
    }
}
