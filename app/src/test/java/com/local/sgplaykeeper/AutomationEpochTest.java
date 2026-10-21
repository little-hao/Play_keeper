package com.local.sgplaykeeper;

import org.junit.Test;
import static org.junit.Assert.*;

public class AutomationEpochTest {
    @Test public void callbackRemainsValidWithinOneExecution() {
        AutomationEpoch epoch = new AutomationEpoch();
        epoch.advance();
        assertTrue(epoch.isCurrent(epoch.current()));
    }

    @Test public void cancelThenRestartSameTaskRejectsOldCallback() {
        AutomationEpoch epoch = new AutomationEpoch();
        epoch.advance();
        long old = epoch.current();
        epoch.advance(); // cancel
        epoch.advance(); // a new execution of the same task
        assertFalse(epoch.isCurrent(old));
        assertTrue(epoch.isCurrent(epoch.current()));
    }

    @Test public void completionAndLifecycleStopInvalidateCallbacks() {
        AutomationEpoch epoch = new AutomationEpoch();
        long beforeCompletion = epoch.current();
        epoch.advance();
        assertFalse(epoch.isCurrent(beforeCompletion));
        long beforeStop = epoch.current();
        epoch.advance();
        assertFalse(epoch.isCurrent(beforeStop));
    }

    @Test public void accountsHaveIndependentExecutions() {
        AutomationEpoch seller = new AutomationEpoch();
        AutomationEpoch buyer = new AutomationEpoch();
        long buyerCallback = buyer.current();
        seller.advance();
        assertTrue(buyer.isCurrent(buyerCallback));
    }
}
