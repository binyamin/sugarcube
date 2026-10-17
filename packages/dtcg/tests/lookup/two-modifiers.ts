import { type DesignTokens, readFromMemory } from "../../src/index.js";

const red = { colorSpace: "srgb", components: [1, 0, 0] };
const blue = { colorSpace: "srgb", components: [0, 0, 1] };
const color = (value: unknown) => ({ $type: "color", $value: value });
const number = (value: number) => ({ $type: "number", $value: value });
const stop = (position: number) => ({ color: "{color.red}", position });

export const twoModifierFiles = {
    "tokens.resolver.json": JSON.stringify({
        version: "2025.10",
        resolutionOrder: [
            { type: "set", name: "base", sources: [{ $ref: "base.json" }] },
            {
                type: "modifier",
                name: "mode",
                default: "light",
                contexts: { light: [], dark: [{ $ref: "dark.json" }] },
            },
            {
                type: "modifier",
                name: "size",
                default: "small",
                contexts: { small: [], large: [{ $ref: "large.json" }] },
            },
        ],
    }),
    "base.json": JSON.stringify({
        color: { red: color(red), blue: color(blue), x: color("{color.blue}") },
        gap: number(1),
    }),
    "dark.json": JSON.stringify({
        color: { x: color("{color.red}") },
        fade: { $type: "gradient", $value: [stop(0), stop(1)] },
        gap: number(2),
    }),
    "large.json": JSON.stringify({
        color: { x: color("{color.red}"), broken: color("{color.missing}") },
        gap: number(3),
    }),
};

export function twoModifiers(changed: Record<string, string> = {}): DesignTokens {
    return readFromMemory({ files: { ...twoModifierFiles, ...changed } });
}
