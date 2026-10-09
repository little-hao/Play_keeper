package com.local.sgplaykeeper;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.util.AbstractMap;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import org.junit.Test;

public class EquipmentTransferAuditTest {
    @Test
    public void allTenItemsAreConfirmedIndividually() {
        Map<String, String> actual = completeTargetSet();

        EquipmentTransferAudit.Result result = EquipmentTransferAudit.evaluate(
                EquipmentTransferAudit.PetScope.MAIN, actual, Collections.emptySet());

        assertTrue(result.allTransferred());
        assertEquals(10, result.items().size());
        for (EquipmentTransferAudit.ItemResult item : result.items()) {
            assertEquals(EquipmentTransferAudit.ItemStatus.TRANSFERRED, item.status);
        }
    }

    @Test
    public void missingItemIsSkippedAndOtherNineAreStillChecked() {
        Map<String, String> actual = completeTargetSet();
        actual.remove("头部");

        EquipmentTransferAudit.Result result = EquipmentTransferAudit.evaluate(
                EquipmentTransferAudit.PetScope.MAIN, actual,
                Collections.singleton("柔情方巾·改"));

        assertFalse(result.allTransferred());
        assertEquals(10, result.items().size());
        assertEquals(EquipmentTransferAudit.ItemStatus.SKIPPED_MISSING,
                result.items().get(0).status);
        assertEquals(9, result.items().stream()
                .filter(item -> item.status == EquipmentTransferAudit.ItemStatus.TRANSFERRED)
                .count());
    }

    @Test
    public void secondaryPetIsRejectedBeforeItsEquipmentCanBeRead() {
        Map<String, String> mustNotBeRead = new AbstractMap<String, String>() {
            @Override
            public Set<Entry<String, String>> entrySet() {
                throw new AssertionError("secondary-pet equipment was accessed");
            }

            @Override
            public String get(Object key) {
                throw new AssertionError("secondary-pet equipment was accessed");
            }
        };

        assertThrows(IllegalArgumentException.class, () -> EquipmentTransferAudit.evaluate(
                EquipmentTransferAudit.PetScope.SECONDARY, mustNotBeRead,
                Collections.emptySet()));
    }

    @Test
    public void wrongEquipmentInTheSameSlotCannotPass() {
        Map<String, String> actual = completeTargetSet();
        actual.put("身体", "暗夜女神·影【神】");

        EquipmentTransferAudit.Result result = EquipmentTransferAudit.evaluate(
                EquipmentTransferAudit.PetScope.MAIN, actual, Collections.emptySet());

        assertFalse(result.allTransferred());
        EquipmentTransferAudit.ItemResult body = result.items().stream()
                .filter(item -> "身体".equals(item.slot))
                .findFirst()
                .orElseThrow(() -> new AssertionError("body slot result missing"));
        assertEquals("轻罗流萤衫·改", body.expectedName);
        assertEquals("暗夜女神·影【神】", body.actualName);
        assertEquals(EquipmentTransferAudit.ItemStatus.WRONG_ITEM_IN_SLOT, body.status);
    }

    @Test
    public void unrelatedInventoryAndAttributesDoNotAffectTheTenItemResult() {
        Map<String, String> actual = completeTargetSet();
        actual.put("未纳入的额外槽位", "火龙之牙");

        EquipmentTransferAudit.Result result = EquipmentTransferAudit.evaluate(
                EquipmentTransferAudit.PetScope.MAIN, actual, Collections.emptySet());

        assertTrue(result.allTransferred());
        assertEquals(10, result.items().size());
    }

    private static Map<String, String> completeTargetSet() {
        Map<String, String> actual = new LinkedHashMap<>();
        actual.put("头部", "柔情方巾·改");
        actual.put("身体", "轻罗流萤衫·改");
        actual.put("脚部", "逢羡履·改");
        actual.put("武器", "君我剑·改");
        actual.put("项链", "佳人之恋·改");
        actual.put("戒指", "三生戒·改");
        actual.put("翅膀", "比翼·改");
        actual.put("手镯", "相望镯·改");
        actual.put("宝石", "尾生之泪·改");
        actual.put("道具", "龙神印记·庆");
        return actual;
    }
}
