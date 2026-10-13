import { describe, expect, it } from "vitest";
import { type DesignSystem, readFromMemory } from "../../src/index.js";

function oneFile(tokens: unknown): DesignSystem {
    return readFromMemory({ files: { "tokens.json": JSON.stringify(tokens) } });
}

describe("what applies to a group, and what it writes itself", () => {
    const doc = oneFile({
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
        expect(doc.permutation().group("color.brand")?.type).toBe("color");
        expect(doc.permutation().group("color.brand")?.authored).toBeUndefined();
    });

    it("says what it writes itself", () => {
        expect(doc.permutation().group("button")?.authored).toStrictEqual({
            type: "dimension",
            description: "Base button",
            deprecated: "Use control",
            extensions: { "com.example": { a: 1 } },
        });
    });

    it("takes what it extends, and says only its own as written (Format 6.4)", () => {
        const primary = doc.permutation().group("primary");
        expect(primary?.type).toBe("dimension");
        expect(primary?.deprecated).toBe("Use control");
        expect(primary?.description).toBe("Primary only");
        expect(primary?.authored).toStrictEqual({ description: "Primary only" });
    });

    it("takes its parent's deprecation, unless it writes false (Format 6.3.1)", () => {
        expect(doc.permutation().group("old")?.deprecated).toBe(true);
        expect(doc.permutation().group("old.kept")?.deprecated).toBe(false);
        expect(doc.permutation().group("old.kept")?.authored).toStrictEqual({ deprecated: false });
        expect(doc.permutation().token("old.kept.one")?.deprecated).toBe(false);
    });
});

describe("what a token writes itself", () => {
    const doc = oneFile({
        space: { $type: "number", $deprecated: "Use gap", sm: { $value: 1 } },
        size: { lg: { $type: "number", $deprecated: true, $value: 2 } },
    });

    it("holds its own $type and $deprecated beside its value", () => {
        expect(doc.permutation().token("size.lg")?.authored).toStrictEqual({
            value: 2,
            type: "number",
            deprecated: true,
        });
    });

    it("leaves out what it takes from its group", () => {
        expect(doc.permutation().token("space.sm")?.type).toBe("number");
        expect(doc.permutation().token("space.sm")?.deprecated).toBe("Use gap");
        expect(doc.permutation().token("space.sm")?.authored).toStrictEqual({ value: 1 });
    });
});
