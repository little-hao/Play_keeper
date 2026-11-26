package com.local.sgplaykeeper;

/** Pure decision logic for dungeon start verification, kept independent from WebView. */
final class DungeonRunEvidence {
    final boolean selectedDungeon;
    final boolean stopControl;
    final boolean runningState;
    final boolean startDisabled;
    final boolean progressMarker;

    DungeonRunEvidence(boolean selectedDungeon, boolean stopControl,
                       boolean runningState, boolean startDisabled,
                       boolean progressMarker) {
        this.selectedDungeon = selectedDungeon;
        this.stopControl = stopControl;
        this.runningState = runningState;
        this.startDisabled = startDisabled;
        this.progressMarker = progressMarker;
    }

    int reliableSignalCount() {
        int count = selectedDungeon ? 1 : 0;
        if (stopControl) count++;
        if (runningState) count++;
        if (startDisabled) count++;
        if (progressMarker) count++;
        return count;
    }

    boolean confirmsStarted() {
        return selectedDungeon && reliableSignalCount() >= 2;
    }

    String diagnostic() {
        return "selected=" + selectedDungeon
                + ",stop=" + stopControl
                + ",running=" + runningState
                + ",startDisabled=" + startDisabled
                + ",progress=" + progressMarker;
    }
}
