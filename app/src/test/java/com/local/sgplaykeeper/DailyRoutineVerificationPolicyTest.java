package com.local.sgplaykeeper;

import org.junit.Test;

import static org.junit.Assert.*;

public class DailyRoutineVerificationPolicyTest {
    @Test public void openedTaskPageRemainsAWaitState() {
        assertTrue(DailyRoutineVerificationPolicy.isLoadingTransition("retry|opened"));
        assertTrue(DailyRoutineVerificationPolicy.isLoadingTransition("retry|accepted_tab"));
    }

    @Test public void dailyTaskAbsenceNeedsThreeStableProbes() {
        assertFalse(DailyRoutineVerificationPolicy.dailyNoActionVerified(2));
        assertTrue(DailyRoutineVerificationPolicy.dailyNoActionVerified(3));
    }

    @Test public void acceptanceAfterClickNeedsTwoStableProbes() {
        assertFalse(DailyRoutineVerificationPolicy.acceptedAfterClickVerified(1));
        assertTrue(DailyRoutineVerificationPolicy.acceptedAfterClickVerified(2));
    }

    @Test public void completableScanNeedsTwoStableProbes() {
        assertFalse(DailyRoutineVerificationPolicy.completableScanVerified(1));
        assertTrue(DailyRoutineVerificationPolicy.completableScanVerified(2));
    }
}
