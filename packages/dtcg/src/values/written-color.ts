import type { ColorComponent, ColorSpace } from "../index.js";
import { colorDecimals, roundedTo } from "./decimals.js";

/** A color as a file writes it: the Color module's object, with only the members given. */
export interface WrittenColor {
    readonly colorSpace: ColorSpace;
    readonly components: readonly [ColorComponent, ColorComponent, ColorComponent];
    readonly alpha?: number;
    readonly hex?: string;
}

/**
 * A color ready to write into a file, from numbers a tool worked out: every number rounded to
 * four decimal places, and a component that is missing or not a number written `"none"`, which
 * the Color module allows for any component. `alpha` and `hex` are written only when given, so
 * the members a file has stay the caller's choice. No conversion happens: the components are in
 * `colorSpace` already.
 *
 * @example
 * writtenColor({ colorSpace: "oklch", components: [0.97, 0.09200000000000001, undefined] })
 * // { colorSpace: "oklch", components: [0.97, 0.092, "none"] }
 */
export function writtenColor(color: {
    colorSpace: ColorSpace;
    components: readonly [Component, Component, Component];
    alpha?: number;
    hex?: string;
}): WrittenColor {
    const [a, b, c] = color.components;
    return {
        colorSpace: color.colorSpace,
        components: [written(a), written(b), written(c)],
        ...(color.alpha !== undefined && { alpha: roundedTo(color.alpha, colorDecimals) }),
        ...(color.hex !== undefined && { hex: color.hex }),
    };
}

type Component = ColorComponent | undefined;

function written(component: Component): ColorComponent {
    return typeof component === "number" && !Number.isNaN(component)
        ? roundedTo(component, colorDecimals)
        : "none";
}
