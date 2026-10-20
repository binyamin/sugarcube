import type { ColorValue } from "../index.js";
import { colorDecimals, roundedTo } from "./decimals.js";
import type { ValueErrorFacts } from "./value-errors.js";

export function hexStringColor(hex: string): ColorValue {
    const full = (hex.length <= 5 ? expandedHex(hex) : hex).slice(1);
    const channel = (start: number) =>
        roundedTo(Number.parseInt(full.slice(start, start + 2), 16) / 255, colorDecimals);
    return {
        colorSpace: "srgb",
        components: [channel(0), channel(2), channel(4)],
        alpha: full.length === 8 ? channel(6) : 1,
        hex: `#${full.slice(0, 6)}`,
    };
}

export function hexStringAsObject(hex: string): ValueErrorFacts["hex-string"]["asObject"] {
    const { colorSpace, components, alpha, hex: kept } = hexStringColor(hex);
    const withAlpha = hex.length === 5 || hex.length === 9;
    return { colorSpace, components, ...(withAlpha && { alpha }), hex: kept };
}

export function expandedHex(shortHex: string): string {
    return `#${Array.from(shortHex.slice(1), (digit) => digit + digit).join("")}`;
}
