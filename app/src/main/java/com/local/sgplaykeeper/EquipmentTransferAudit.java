package com.local.sgplaykeeper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.text.Normalizer;

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
            if (items.isEmpty()) return false;
            for (ItemResult item : items) {
                if (item.status != ItemStatus.TRANSFERRED) return false;
            }
            return true;
        }
    }

    private static final Map<String, String> TARGETS_BY_SLOT;

    static {
        LinkedHashMap<String, String> targets = new LinkedHashMap<>();
        targets.put("头部", "厄菲斯神冠");
        targets.put("身体", "厄菲斯神铠");
        targets.put("脚部", "厄菲斯神靴");
        targets.put("武器", "厄菲斯神剑");
        targets.put("项链", "厄菲斯神链");
        targets.put("戒指", "厄菲斯神戒");
        targets.put("翅膀", "厄菲斯神翼");
        targets.put("手镯", "厄菲斯神镯");
        targets.put("宝石", "厄菲斯神玉");
        targets.put("道具", "厄菲斯神印");
        TARGETS_BY_SLOT = Collections.unmodifiableMap(targets);
    }

    private EquipmentTransferAudit() {
    }

    static List<String> targetNames() {
        return Collections.unmodifiableList(new ArrayList<>(TARGETS_BY_SLOT.values()));
    }

    static Result evaluate(PetScope scope, Map<String, String> mainPetEquipmentBySlot,
                           Set<String> skippedMissingNames) {
        return evaluate(scope, targetNames(), mainPetEquipmentBySlot, skippedMissingNames);
    }

    static Result evaluate(PetScope scope, List<String> expectedNames,
                           Map<String, String> mainPetEquipmentBySlot,
                           Set<String> skippedMissingNames) {
        if (scope != PetScope.MAIN) {
            throw new IllegalArgumentException("Equipment transfer may inspect only the main pet");
        }
        if (expectedNames == null || expectedNames.isEmpty() || expectedNames.size() > 10) {
            throw new IllegalArgumentException("Expected equipment list must contain 1-10 items");
        }
        Map<String, String> actual = mainPetEquipmentBySlot == null
                ? Collections.emptyMap() : mainPetEquipmentBySlot;
        Set<String> skipped = skippedMissingNames == null
                ? Collections.emptySet() : new LinkedHashSet<>(skippedMissingNames);
        List<String> slots = new ArrayList<>(TARGETS_BY_SLOT.keySet());
        List<ItemResult> results = new ArrayList<>(expectedNames.size());
        for (int index = 0; index < expectedNames.size(); index++) {
            String slot = slots.get(index);
            String expectedName = expectedNames.get(index);
            String actualName = actual.get(slot);
            ItemStatus status;
            if (matchesEquipmentName(expectedName, actualName)) {
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

    static boolean matchesEquipmentName(String expected, String actual) {
        return normalizeEquipmentName(expected).equals(normalizeEquipmentName(actual));
    }

    /** Targets may be edited/reordered in the console; never infer a slot from list position. */
    static Result evaluateObserved(List<String> expectedNames, Map<String, String> observed) {
        Map<String, String> actual = observed == null ? Collections.emptyMap() : observed;
        List<ItemResult> results = new ArrayList<>();
        Set<String> usedSlots = new LinkedHashSet<>();
        for (String expected : expectedNames) {
            String knownSlot = "";
            for (Map.Entry<String, String> entry : TARGETS_BY_SLOT.entrySet()) {
                if (matchesEquipmentName(expected, entry.getValue())) knownSlot = entry.getKey();
            }
            String foundSlot = "";
            for (Map.Entry<String, String> entry : actual.entrySet()) {
                if (!usedSlots.contains(entry.getKey())
                        && (knownSlot.isEmpty() || knownSlot.equals(entry.getKey()))
                        && matchesEquipmentName(expected, entry.getValue())) {
                    foundSlot = entry.getKey();
                    break;
                }
            }
            if (!foundSlot.isEmpty()) {
                usedSlots.add(foundSlot);
                results.add(new ItemResult(foundSlot, expected, actual.get(foundSlot),
                        ItemStatus.TRANSFERRED));
            } else {
                results.add(new ItemResult(knownSlot, expected, actual.get(knownSlot),
                        ItemStatus.EMPTY_SLOT));
            }
        }
        return new Result(results);
    }

    /**
     * Fallback evidence for pages that do not expose names/main-pet semantics.
     * Every configured item must have completed purchase, no item may have been
     * skipped, and the post-wear equipment panel must contain enough filled slots.
     */
    static boolean workflowCompleted(List<String> expectedNames, Set<String> purchasedNames,
                                     Set<String> skippedNames, int filledSlots) {
        if (expectedNames == null || expectedNames.isEmpty() || expectedNames.size() > 10) {
            return false;
        }
        Set<String> purchased = purchasedNames == null
                ? Collections.emptySet() : new LinkedHashSet<>(purchasedNames);
        Set<String> skipped = skippedNames == null
                ? Collections.emptySet() : new LinkedHashSet<>(skippedNames);
        return skipped.isEmpty() && purchased.containsAll(expectedNames)
                && filledSlots >= expectedNames.size();
    }

    private static String normalizeEquipmentName(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
                .replaceAll("\\s+", "")
                .replaceAll("[•・．]", "·")
                .replaceFirst("(?:已装备|主宠|装备)$", "")
                .replaceFirst("[（(]\\+(?:[1-9]|1[0-5])[）)]$", "");
    }
}
