package com.local.sgplaykeeper;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class EquipmentListingReconciler {
    static final class Result {
        final Set<String> activeNames;
        final int resumeIndex;

        Result(Set<String> activeNames, int resumeIndex) {
            this.activeNames = activeNames;
            this.resumeIndex = resumeIndex;
        }

        int activeCount() {
            return activeNames.size();
        }
    }

    private EquipmentListingReconciler() {}

    static Result reconcile(List<String> configuredItems, int startIndex,
                            List<String> marketNames) {
        Set<String> allowed = new LinkedHashSet<>(configuredItems);
        Set<String> active = new LinkedHashSet<>();
        for (String name : new ArrayList<>(marketNames)) {
            if (allowed.contains(name)) active.add(name);
        }
        int resume = Math.max(0, startIndex);
        while (resume < configuredItems.size() && active.contains(configuredItems.get(resume))) {
            resume++;
        }
        return new Result(active, resume);
    }
}
