import { describe, expect, it } from "vitest";
import { findMatchingSkuId } from "./routers/production";

describe("production calendar SKU matching", () => {
  it("links the short Pheotera stick calendar label to the pain stick SKU", () => {
    const skus = [
      { id: 1, name: "Alpha Chunk - 2pk" },
      { id: 2, name: "Pheotera Stick 2oz 100mg/100mg The Pain Stick" },
    ];

    expect(findMatchingSkuId("pheotera 2oz stick", skus)).toBe(2);
  });
});
