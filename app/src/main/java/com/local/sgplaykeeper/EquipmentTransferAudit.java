package com.local.sgplaykeeper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Pure final-state check for the ten-item equipment relay.
 *
 * <p>The existing WebView automation remains responsible for finding, scrolling, listing and
 * buying equipment.  This class deliberately receives only the current main pet's ten slots, so
 * equipment on a secondary pet cannot affect the result.</p>
 */
final class EquipmentTransferAudit {
    enum PetScope {
        MAIN,
        SECONDARY
    }

    enum ItemStatus {
        TRANSFERRED,
        SKIPPED_MISSING,
        EMPTY_SLOT,
        WRONG_ITEM_IN_SLOT
    }

    static final class ItemResult {
        final String slot;
        final String expectedName;
        final String actualName;
        final ItemStatus status;

        ItemResult(String slot, String expectedName, String actualName, ItemStatus status) {
            this.slot = slot;
            this.expectedName = expectedName;
            this.actualName = actualName;
            this.status = status;
        }
    }

    static final class Result {
        private final List<ItemResult> items;

        Result(List<ItemResult> items) {
            this.items = Collections.unmodifiableList(new ArrayList<>(items));
        }

        List<ItemResult> items() {
            return items;
        }

        boolean allTransferred() {
            if (items.size() != TARGETS_BY_SLOT.size()) return false;
            for (ItemResult item : items) {
                if (item.status != ItemStatus.TRANSFERRED) return false;
            }
            return true;
        }
    }

    private static final Map<String, String> TARGETS_BY_SLOT;

    static {
        LinkedHashMap<String, String> targets = new LinkedHashMap<>();
        targets.put("头部", "柔情方巾·改");
        targets.put("身体", "轻罗流萤衫·改");
        targets.put("脚部", "逢羡履·改");
        targets.put("武器", "君我剑·改");
        targets.put("项链", "佳人之恋·改");
        targets.put("戒指", "三生戒·改");
        targets.put("翅膀", "比翼·改");
        targets.put("手镯", "相望镯·改");
        targets.put("宝石", "尾生之泪·改");
        targets.put("道具", "龙神印记·庆");
        TARGETS_BY_SLOT = Collections.unmodifiableMap(targets);
    }

    private EquipmentTransferAudit() {
    }

    static List<String> targetNames() {
        return Collections.unmodifiableList(new ArrayList<>(TARGETS_BY_SLOT.values()));
    }

    static Result evaluate(PetScope scope, Map<String, String> mainPetEquipmentBySlot,
                           Set<String> skippedMissingNames) {
        if (scope != PetScope.MAIN) {
            throw new IllegalArgumentException("Equipment transfer may inspect only the main pet");
        }
        Map<String, String> actual = mainPetEquipmentBySlot == null
                ? Collections.emptyMap() : mainPetEquipmentBySlot;
        Set<String> skipped = skippedMissingNames == null
                ? Collections.emptySet() : new LinkedHashSet<>(skippedMissingNames);
        List<ItemResult> results = new ArrayList<>(TARGETS_BY_SLOT.size());
        for (Map.Entry<String, String> target : TARGETS_BY_SLOT.entrySet()) {
            String slot = target.getKey();
            String expectedName = target.getValue();
            String actualName = actual.get(slot);
            ItemStatus status;
            if (expectedName.equals(actualName)) {
                status = ItemStatus.TRANSFERRED;
            } else if (skipped.contains(expectedName)) {
                status = ItemStatus.SKIPPED_MISSING;
            } else if (actualName == null || actualName.trim().isEmpty()) {
                status = ItemStatus.EMPTY_SLOT;
            } else {
                status = ItemStatus.WRONG_ITEM_IN_SLOT;
            }
            results.add(new ItemResult(slot, expectedName, actualName, status));
        }
        return new Result(results);
    }
}
