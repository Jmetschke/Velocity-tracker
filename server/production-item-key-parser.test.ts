import { describe, expect, it } from "vitest";
import { buildExcelBuffer } from "./test-helpers";
import { parseProductionItemKey } from "./production-item-key-parser";

describe("parseProductionItemKey", () => {
  it("finds a displaced header and combines current and alternate METRC names", async () => {
    const workbook = await buildExcelBuffer("Item Key", [
      ["Production item reference"],
      [],
      [],
      [
        "Item Common Name",
        "Item Distru Name",
        "Item Metrc Name",
        "Alternate or old metrc names",
        "Batch Size",
        "Whole Sale Cost",
      ],
      [
        "Alpha 1pk",
        "Distru Alpha",
        "Current Alpha",
        "Old Alpha\nOlder Alpha",
        7500,
        null,
      ],
    ]);

    await expect(parseProductionItemKey(workbook)).resolves.toEqual([
      {
        commonName: "Alpha 1pk",
        metrcItemNames: ["Current Alpha", "Old Alpha", "Older Alpha"],
        batchSize: 7500,
        sourceRow: 5,
      },
    ]);
  });

  it("requires the correctly spelled alternate-name column", async () => {
    const workbook = await buildExcelBuffer("Item Key", [
      ["Item Common Name", "Item Metrc Name", "Alternate or olld metrc names"],
      ["Alpha 1pk", "Current Alpha", "Old Alpha"],
    ]);

    await expect(parseProductionItemKey(workbook)).rejects.toThrow(
      "Alternate or old metrc names",
    );
  });
});
