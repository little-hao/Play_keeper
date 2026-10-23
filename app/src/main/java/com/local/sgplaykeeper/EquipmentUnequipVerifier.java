package com.local.sgplaykeeper;

/** Pure decision helper for the DOM result read after a one-click unequip action. */
final class EquipmentUnequipVerifier {
    enum Result {
        CONFIRMED,
        STILL_EQUIPPED,
        UNAVAILABLE
    }

    private EquipmentUnequipVerifier() {}

    static Result evaluate(int totalSlots, int filledSlots) {
        if (totalSlots != 10 || filledSlots < 0 || filledSlots > totalSlots) {
            return Result.UNAVAILABLE;
        }
        return filledSlots == 0 ? Result.CONFIRMED : Result.STILL_EQUIPPED;
    }
}
