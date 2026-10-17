import { describe, expect, it } from "vitest";
import { type DesignTokens, readFromMemory } from "../../src/index.js";

function oneFile(json: unknown): DesignTokens {
    return readFromMemory({ files: { "tokens.json": JSON.stringify(json) } });
}

describe("what applies to a group, and what it writes itself", () => {
    const tokens = oneFile({
        color: {
            $type: "color",
            $description: "All colours",
            brand: { "500": { $value: { colorSpace: "srgb", components: [1, 0, 0] } } },
        },
        button: {
            $type: "dimension",
            $description: "Base button",
            $deprecated: "Use control",
            $extensions: { "com.example": { a: 1 } },
            pad: { $value: { value: 4, unit: "px" } },
        },
        primary: {
            $extends: "{button}",
            $description: "Primary only",
            gap: { $value: { value: 2, unit: "px" } },
        },
        old: {
            $type: "number",
            $deprecated: true,
            kept: { $deprecated: false, one: { $value: 1 } },
        },
    });

    it("takes its type from the group it is inside when it writes none (Format 6.7.3)", () => {
        expect(tokens.permutation().group("color.brand")?.type).toBe("color");
        expect(tokens.permutation().group("color.brand")?.authored).toBeUndefined();
    });

    it("says what it writes itself", () => {
        expect(tokens.permutation().group("button")?.authored).toStrictEqual({
            type: "dimension",
            description: "Base button",
            deprecated: "Use control",
            extensions: { "com.example": { a: 1 } },
        });
    });

    it("takes what it extends, and says only its own as written (Format 6.4)", () => {
        const primary = tokens.permutation().group("primary");
        expect(primary?.type).toBe("dimension");
        expect(primary?.deprecated).toBe("Use control");
        expect(primary?.description).toBe("Primary only");
        expect(primary?.authored).toStrictEqual({ description: "Primary only" });
    });

    it("takes its parent's deprecation, unless it writes false (Format 6.3.1)", () => {
        expect(tokens.permutation().group("old")?.deprecated).toBe(true);
        expect(tokens.permutation().group("old.kept")?.deprecated).toBe(false);
        expect(tokens.permutation().group("old.kept")?.authored).toStrictEqual({
            deprecated: false,
        });
        expect(tokens.permutation().token("old.kept.one")?.deprecated).toBe(false);
    });
});

describe("what a token writes itself", () => {
    const tokens = oneFile({
        space: { $type: "number", $deprecated: "Use gap", sm: { $value: 1 } },
        size: { lg: { $type: "number", $deprecated: true, $value: 2 } },
    });

    it("holds its own $type and $deprecated beside its value", () => {
        expect(tokens.permutation().token("size.lg")?.authored).toStrictEqual({
            value: 2,
            type: "number",
            deprecated: true,
        });
    });

    it("leaves out what it takes from its group", () => {
        expect(tokens.permutation().token("space.sm")?.type).toBe("number");
        expect(tokens.permutation().token("space.sm")?.deprecated).toBe("Use gap");
        expect(tokens.permutation().token("space.sm")?.authored).toStrictEqual({ value: 1 });
    });
});
