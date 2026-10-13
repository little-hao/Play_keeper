package com.local.sgplaykeeper;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.Arrays;
import java.util.List;

public final class EquipmentListingReconcilerTest {
    private static final List<String> ITEMS = Arrays.asList(
            "装备1", "装备2", "装备3", "装备4", "装备5", "装备6");

    @Test
    public void reentryRestoresFiveActiveListingsAndResumesAtSixth() {
        EquipmentListingReconciler.Result result = EquipmentListingReconciler.reconcile(
                ITEMS, 0, ITEMS.subList(0, 5));
        assertEquals(5, result.activeCount());
        assertEquals(5, result.resumeIndex);
    }

    @Test
    public void reentryWithFourListingsAllowsTheFifthListing() {
        EquipmentListingReconciler.Result result = EquipmentListingReconciler.reconcile(
                ITEMS, 0, ITEMS.subList(0, 4));
        assertEquals(4, result.activeCount());
        assertEquals(4, result.resumeIndex);
    }

    @Test
    public void unrelatedMarketRowsAreIgnored() {
        EquipmentListingReconciler.Result result = EquipmentListingReconciler.reconcile(
                ITEMS, 2, Arrays.asList("其他装备", "装备3"));
        assertEquals(1, result.activeCount());
        assertEquals(3, result.resumeIndex);
    }

    @Test
    public void aRemainingFifthListingResumesAtTheSecondBatchBoundary() {
        EquipmentListingReconciler.Result result = EquipmentListingReconciler.reconcile(
                ITEMS, 4, Arrays.asList("装备5"));
        assertEquals(1, result.activeCount());
        assertEquals(5, result.resumeIndex);
    }

    @Test
    public void enhancedMarketNameReconcilesWithConfiguredBaseName() {
        List<String> configured = Arrays.asList("厄菲斯神剑", "厄菲斯神铠");

        EquipmentListingReconciler.Result result = EquipmentListingReconciler.reconcile(
                configured, 0, Arrays.asList("厄菲斯神剑(+4)"));

        assertEquals(1, result.activeCount());
        assertEquals(1, result.resumeIndex);
    }
}
