package com.local.sgplaykeeper;

import org.junit.Test;

import static org.junit.Assert.*;

public class DungeonRunEvidenceTest {
    @Test public void visibleStopButtonConfirmsSelectedDungeon() {
        assertTrue(new DungeonRunEvidence(true, true, false, false, false).confirmsStarted());
    }

    @Test public void alternateRunningStateConfirmsSelectedDungeon() {
        assertTrue(new DungeonRunEvidence(true, false, true, false, false).confirmsStarted());
    }

    @Test public void disabledStartConfirmsSelectedDungeon() {
        assertTrue(new DungeonRunEvidence(true, false, false, true, false).confirmsStarted());
    }

    @Test public void runningSignalWithoutSelectedDungeonIsRejected() {
        assertFalse(new DungeonRunEvidence(false, true, true, true, true).confirmsStarted());
    }

    @Test public void selectedDungeonAloneIsNotEnough() {
        assertFalse(new DungeonRunEvidence(true, false, false, false, false).confirmsStarted());
    }
}
