package com.local.sgplaykeeper;

/** Stable-probe thresholds used while the AFK helper is still rendering task data. */
final class DailyRoutineVerificationPolicy {
    static final int DAILY_NO_ACTION_STABLE_PROBES = 3;
    static final int ACCEPTED_AFTER_CLICK_STABLE_PROBES = 2;
    static final int COMPLETABLE_SCAN_STABLE_PROBES = 2;

    private DailyRoutineVerificationPolicy() {}

    static boolean dailyNoActionVerified(int probes) {
        return probes >= DAILY_NO_ACTION_STABLE_PROBES;
    }

    static boolean acceptedAfterClickVerified(int probes) {
        return probes >= ACCEPTED_AFTER_CLICK_STABLE_PROBES;
    }

    static boolean completableScanVerified(int probes) {
        return probes >= COMPLETABLE_SCAN_STABLE_PROBES;
    }

    static boolean isLoadingTransition(String result) {
        return result != null && result.startsWith("retry|");
    }
}
