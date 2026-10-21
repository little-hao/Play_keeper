package com.local.sgplaykeeper;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.LinkedHashSet;
import org.junit.Test;
import static org.junit.Assert.*;

public class EquipmentObservationTest {
    @Test public void targetOrderDoesNotDetermineObservedSlot() {
        Map<String, String> observed = new LinkedHashMap<>();
        observed.put("头部", "厄菲斯神冠(+15)");
        observed.put("武器", "厄菲斯神剑");
        assertTrue(EquipmentTransferAudit.evaluateObserved(
                Arrays.asList("厄菲斯神剑", "厄菲斯神冠"), observed).allTransferred());
    }

    @Test public void emptyObservationNeverPassesEvenWithExpectedNames() {
        assertFalse(EquipmentTransferAudit.evaluateObserved(
                EquipmentTransferAudit.targetNames(), Collections.emptyMap()).allTransferred());
    }

    @Test public void wrongKnownSlotDoesNotPass() {
        assertFalse(EquipmentTransferAudit.evaluateObserved(
                Arrays.asList("厄菲斯神冠"), Collections.singletonMap("武器", "厄菲斯神冠"))
                .allTransferred());
    }

    @Test public void oneObservedItemCannotSatisfyTwoTargets() {
        assertFalse(EquipmentTransferAudit.evaluateObserved(
                Arrays.asList("君我剑§恋§", "君我剑§恋§(+1)"),
                Collections.singletonMap("武器", "君我剑§恋§(+15)")).allTransferred());
    }

    @Test public void customNamesStillNeedExactObservedEvidence() {
        assertTrue(EquipmentTransferAudit.evaluateObserved(
                Arrays.asList("君我剑§恋§"),
                Collections.singletonMap("武器", "君我剑§恋§（＋15）")).allTransferred());
        assertFalse(EquipmentTransferAudit.evaluateObserved(
                Arrays.asList("君我剑§恋§"),
                Collections.singletonMap("武器", "君我剑§恋§其他")).allTransferred());
    }

    @Test public void cleanWorkflowCanContinueWithoutMachineReadableMainPetMarker() {
        LinkedHashSet<String> purchased = new LinkedHashSet<>(
                Arrays.asList("厄菲斯神剑", "厄菲斯神冠"));
        assertTrue(EquipmentTransferAudit.workflowCompleted(
                Arrays.asList("厄菲斯神剑", "厄菲斯神冠"), purchased,
                Collections.emptySet(), 2));
    }

    @Test public void workflowDoesNotContinueWithMissingSkippedOrUnfilledEquipment() {
        assertFalse(EquipmentTransferAudit.workflowCompleted(
                Arrays.asList("厄菲斯神剑", "厄菲斯神冠"),
                Collections.singleton("厄菲斯神剑"), Collections.emptySet(), 2));
        assertFalse(EquipmentTransferAudit.workflowCompleted(
                Arrays.asList("厄菲斯神剑"), Collections.singleton("厄菲斯神剑"),
                Collections.singleton("厄菲斯神冠"), 1));
        assertFalse(EquipmentTransferAudit.workflowCompleted(
                Arrays.asList("厄菲斯神剑", "厄菲斯神冠"),
                new LinkedHashSet<>(Arrays.asList("厄菲斯神剑", "厄菲斯神冠")),
                Collections.emptySet(), 1));
    }
}
