import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber, formatPct, parseUsd } from "./format";

describe("money and number formatting (es-BO)", () => {
  it("writes dollars one way everywhere: $us, decimal comma, period thousands", () => {
    expect(formatMoney(BigInt(6_000_000))).toBe("$us 0,60");
    expect(formatMoney(parseUsd("60000")!, 0)).toBe("$us 60.000");
    expect(formatMoney(parseUsd("1234,5")!)).toBe("$us 1.234,50");
  });

  it("formats plain numbers and percentages with a decimal comma", () => {
    expect(formatNumber(4.6, 1)).toBe("4,6");
    expect(formatNumber(1200)).toBe("1.200");
    expect(formatPct(250)).toBe("2,5%");
    expect(formatPct(2000)).toBe("20%");
  });
});
