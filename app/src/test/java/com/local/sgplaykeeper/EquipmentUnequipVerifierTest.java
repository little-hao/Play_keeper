package com.local.sgplaykeeper;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class EquipmentUnequipVerifierTest {
    @Test
    public void emptyEquipmentSlotsAllowTransferToContinue() {
        assertEquals(EquipmentUnequipVerifier.Result.CONFIRMED,
                EquipmentUnequipVerifier.evaluate(10, 0));
    }

    @Test
    public void anyRemainingEquipmentBlocksTheExchange() {
        assertEquals(EquipmentUnequipVerifier.Result.STILL_EQUIPPED,
                EquipmentUnequipVerifier.evaluate(10, 1));
        assertEquals(EquipmentUnequipVerifier.Result.STILL_EQUIPPED,
                EquipmentUnequipVerifier.evaluate(10, 10));
    }

    @Test
    public void MissingOrInvalidDomEvidenceCannotPass() {
        assertEquals(EquipmentUnequipVerifier.Result.UNAVAILABLE,
                EquipmentUnequipVerifier.evaluate(0, -1));
        assertEquals(EquipmentUnequipVerifier.Result.UNAVAILABLE,
                EquipmentUnequipVerifier.evaluate(1, 0));
        assertEquals(EquipmentUnequipVerifier.Result.UNAVAILABLE,
                EquipmentUnequipVerifier.evaluate(10, 11));
    }
}
