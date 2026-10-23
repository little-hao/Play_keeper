package com.local.sgplaykeeper;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class EquipmentListingReconciler {
    static final class Result {
        final Set<String> activeNames;
        final int resumeIndex;
        final int marketActiveCount;

        Result(Set<String> activeNames, int resumeIndex, int marketActiveCount) {
            this.activeNames = activeNames;
            this.resumeIndex = resumeIndex;
            // The exchange can contain unrelated historical listings.  The five-item
            // limit is the transfer batch size, not the total number of rows shown on
            // the left side of the exchange, so only configured target listings count.
            this.marketActiveCount = activeNames.size();
        }

        int activeCount() {
            return activeNames.size();
        }

        int marketActiveCount() {
            return marketActiveCount;
        }
    }

    private EquipmentListingReconciler() {}

    static Result reconcile(List<String> configuredItems, int startIndex,
                            List<String> marketNames) {
        return reconcile(configuredItems, startIndex, marketNames, marketNames.size());
    }

    static Result reconcile(List<String> configuredItems, int startIndex,
                            List<String> marketNames, int marketActiveCount) {
        Set<String> active = new LinkedHashSet<>();
        for (String name : new ArrayList<>(marketNames)) {
            String normalized = normalize(name);
            for (String configured : configuredItems) {
                if (normalize(configured).equals(normalized)) {
                    active.add(configured);
                    break;
                }
            }
        }
        int resume = Math.max(0, startIndex);
        while (resume < configuredItems.size() && active.contains(configuredItems.get(resume))) {
            resume++;
        }
        return new Result(active, resume, active.size());
    }

    private static String normalize(String value) {
        if (value == null) return "";
        return value.replaceAll("\\s+", "")
                .replaceFirst("[（(][+＋]?\\d+[）)]$", "");
    }
}
