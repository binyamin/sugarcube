import type { ColorValue, JsonValue } from "@sugarcube-sh/dtcg";
import { isJsonObject, parseValue } from "@sugarcube-sh/dtcg/values";
import { type Color, type Mode, converter, formatCss, formatHex, formatHex8, parse } from "culori";

export interface ColorField {
    readonly kind: "color";
    readonly written: JsonValue;
    readonly color: Color;
    readonly space?: Space;
}

interface Space {
    readonly name: string;
    readonly mode: Mode;
    readonly channels: readonly [string, string, string];
    readonly scale: readonly [number, number, number];
}

const rgb = ["r", "g", "b"] as const;
const same = [1, 1, 1] as const;

const spaces: readonly Space[] = [
    { name: "srgb", mode: "rgb", channels: rgb, scale: same },
    { name: "srgb-linear", mode: "lrgb", channels: rgb, scale: same },
    { name: "hsl", mode: "hsl", channels: ["h", "s", "l"], scale: [1, 100, 100] },
    { name: "hwb", mode: "hwb", channels: ["h", "w", "b"], scale: [1, 100, 100] },
    { name: "lab", mode: "lab", channels: ["l", "a", "b"], scale: same },
    { name: "lch", mode: "lch", channels: ["l", "c", "h"], scale: same },
    { name: "oklab", mode: "oklab", channels: ["l", "a", "b"], scale: same },
    { name: "oklch", mode: "oklch", channels: ["l", "c", "h"], scale: same },
    { name: "display-p3", mode: "p3", channels: rgb, scale: same },
    { name: "a98-rgb", mode: "a98", channels: rgb, scale: same },
    { name: "prophoto-rgb", mode: "prophoto", channels: rgb, scale: same },
    { name: "rec2020", mode: "rec2020", channels: rgb, scale: same },
    { name: "xyz-d65", mode: "xyz65", channels: ["x", "y", "z"], scale: same },
    { name: "xyz-d50", mode: "xyz50", channels: ["x", "y", "z"], scale: same },
];

const hexColor = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function colorField(written: JsonValue): ColorField | undefined {
    if (typeof written === "string") {
        const color = hexColor.test(written) ? parse(written) : undefined;
        return color && { kind: "color", written, color };
    }
    const read = parseValue("color", written, [], { references: false });
    if (!read.ok) return undefined;
    const space = spaces.find(({ name }) => name === read.value.colorSpace);
    return space && { kind: "color", written, color: inCulori(read.value, space), space };
}

export function colorCss(field: ColorField): string {
    return typeof field.written === "string" ? field.written : formatCss(field.color);
}

export function isTranslucent(field: ColorField): boolean {
    return (field.color.alpha ?? 1) < 1;
}

export function picked(field: ColorField, value: string): ColorField | undefined {
    const color = parse(value);
    if (!color) return undefined;
    const alpha = color.alpha ?? 1;
    if (!field.space || !isJsonObject(field.written)) {
        const written = alpha < 1 ? formatHex8(color) : formatHex(color);
        return { kind: "color", written, color };
    }
    const was = field.written;
    const space = spaces.find(({ mode }) => mode === color.mode) ?? field.space;
    const channels = new Map<string, unknown>(Object.entries(converter(space.mode)(color)));
    const components = space.channels.map((channel, index) => {
        const component = channels.get(channel);
        return typeof component === "number" ? scaled(component, space.scale[index] ?? 1) : "none";
    });
    const written = {
        colorSpace: space.name,
        components,
        ...((alpha !== 1 || "alpha" in was) && { alpha }),
        ...("hex" in was && { hex: formatHex(color) }),
    };
    return { kind: "color", written, color, space };
}

function inCulori(value: ColorValue, space: Space): Color {
    const color: Record<string, unknown> = { mode: space.mode, alpha: value.alpha };
    space.channels.forEach((channel, index) => {
        const component = value.components[index];
        if (typeof component === "number") color[channel] = component / (space.scale[index] ?? 1);
    });
    return color as unknown as Color;
}

function scaled(component: number, by: number): number {
    return by === 1 ? component : Number((component * by).toPrecision(15));
}
