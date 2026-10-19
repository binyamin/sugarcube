import { describe, expect, it } from "vitest";
import {
    type CSSBlock,
    type CSSBlockInput,
    type CSSDeclaration,
    type CSSWriterOptions,
    cssBlocks,
    cssText,
    cssWriter,
} from "../../src/css.js";
import { type DesignTokens, readFromMemory } from "../../src/index.js";

const px = (value: number) => ({ value, unit: "px" });
const color = (value: unknown) => ({ $type: "color", $value: value });

function themed(base: Record<string, unknown>, dark: Record<string, unknown>): DesignTokens {
    const files = {
        "tokens.resolver.json": {
            version: "2025.10",
            resolutionOrder: [
                { type: "set", name: "base", sources: [{ $ref: "base.json" }] },
                {
                    type: "modifier",
                    name: "mode",
                    default: "light",
                    contexts: { light: [], dark: [{ $ref: "dark.json" }] },
                },
            ],
        },
        "base.json": base,
        "dark.json": dark,
    };
    const texts = Object.fromEntries(
        Object.entries(files).map(([path, json]) => [path, JSON.stringify(json)]),
    );
    return readFromMemory({ files: texts }, { hexStringColors: true });
}

const palette = {
    color: {
        $type: "color",
        ink: { $value: "#111111" },
        paper: { $value: "#ffffff" },
        text: { $value: "{color.ink}" },
        quote: { $value: "{color.text}" },
    },
    gap: { $type: "dimension", $value: px(8) },
};
const tokens = themed(palette, { color: { ink: { $value: "#eeeeee" } } });

function declarationsOf(
    input: Record<string, string>,
    options?: CSSWriterOptions,
): readonly CSSDeclaration[] {
    return cssWriter(options).declarations(tokens.permutation(input)).declarations;
}

const light = declarationsOf({});
const dark = declarationsOf({ mode: "dark" });

function written(block: CSSBlock | undefined): string[] {
    return block?.inRule.map(({ name, value }) => `${name}: ${value}`) ?? [];
}

describe("cssBlocks", () => {
    it("writes a first block in full", () => {
        const [root] = cssBlocks([{ declarations: light, selector: ":root" }]);
        expect(written(root)).toStrictEqual([
            "--color-ink: #111111",
            "--color-paper: #ffffff",
            "--color-text: var(--color-ink)",
            "--color-quote: var(--color-text)",
            "--gap: 8px",
        ]);
    });

    it("writes only what differs from an earlier block reaching it, then what refers to that, through every step", () => {
        const [, later] = cssBlocks([
            { declarations: light, selector: ":root" },
            { declarations: dark, selector: '[data-mode="dark"]' },
        ]);
        expect(written(later)).toStrictEqual([
            "--color-ink: #eeeeee",
            "--color-text: var(--color-ink)",
            "--color-quote: var(--color-text)",
        ]);
    });

    it("writes only what differs when told not to write what refers to it again", () => {
        const [, later] = cssBlocks([
            { declarations: light, selector: ":root" },
            { declarations: dark, selector: '[data-mode="dark"]', redeclare: false },
        ]);
        expect(written(later)).toStrictEqual(["--color-ink: #eeeeee"]);
    });

    it("writes again what a value names through write, not only through a reference", () => {
        const mixed = themed(
            { ...palette, shade: color("#000000") },
            { color: { ink: { $value: "#eeeeee" } } },
        );
        const ink = mixed.permutation().token("color.ink");
        const writer = cssWriter({
            value: (token, { written: value, write }) =>
                token.path === "shade" && ink
                    ? write`color-mix(in oklch, ${ink} 50%, black)`
                    : value,
        });
        const [, later] = cssBlocks([
            {
                declarations: writer.declarations(mixed.permutation()).declarations,
                selector: ":root",
            },
            {
                declarations: writer.declarations(mixed.permutation({ mode: "dark" })).declarations,
                selector: '[data-mode="dark"]',
            },
        ]);
        expect(written(later)).toContain(
            "--shade: color-mix(in oklch, var(--color-ink) 50%, black)",
        );
    });

    describe("which earlier blocks reach a later one", () => {
        const reachedBy = (earlier: Partial<CSSBlockInput>, later: Partial<CSSBlockInput>) => {
            const [, block] = cssBlocks([
                { declarations: light, selector: ":root", ...earlier },
                { declarations: dark, selector: ".later", ...later },
            ]);
            return written(block).length < dark.length;
        };

        it("is reached by :root, since custom properties inherit from it", () => {
            expect(reachedBy({ selector: ":root" }, { selector: ".theme" })).toBe(true);
        });

        it("is reached by a block naming every selector it has", () => {
            expect(reachedBy({ selector: [".a", ".b"] }, { selector: ".a" })).toBe(true);
            expect(reachedBy({ selector: ".a" }, { selector: [".a", ".b"] })).toBe(false);
        });

        it("is not reached by another selector, so it is written in full", () => {
            expect(reachedBy({ selector: ".a" }, { selector: ".b" })).toBe(false);
        });

        it("is reached by a block with no at-rule, or the same ones", () => {
            expect(reachedBy({}, { atRules: ["@media (min-width: 640px)"] })).toBe(true);
            expect(
                reachedBy(
                    { atRules: ["@media print"] },
                    { selector: ":root", atRules: ["@media print"] },
                ),
            ).toBe(true);
        });

        it("is reached by a media query every screen it covers also matches", () => {
            const min = (width: number) => [`@media (min-width: ${width}px)`];
            expect(reachedBy({ atRules: min(640) }, { atRules: min(1024) })).toBe(true);
            expect(reachedBy({ atRules: min(1024) }, { atRules: min(640) })).toBe(false);
            expect(reachedBy({ atRules: min(640) }, {})).toBe(false);
        });

        it("is not reached when it cannot be sure, so it is written in full", () => {
            expect(reachedBy({ atRules: ["@media print"] }, { atRules: ["@media screen"] })).toBe(
                false,
            );
            expect(
                reachedBy(
                    { atRules: ["@media (min-width: 640px)", "@supports (color: red)"] },
                    { atRules: ["@media (min-width: 1024px)"] },
                ),
            ).toBe(false);
        });
    });

    describe("@supports", () => {
        const p3 = { colorSpace: "display-p3", components: [1, 0, 0], hex: "#ff0000" };
        const fallback: CSSWriterOptions["fallback"] = (token, { writtenWith }) => {
            const hex = token.type === "color" ? writtenWith({ colors: "hex" }) : undefined;
            return hex && { written: hex, unless: "(color: color(display-p3 1 1 1))" };
        };
        const wide = themed(
            { brand: color(p3) },
            { brand: color({ ...p3, components: [0, 1, 0], hex: "#ff0000" }) },
        );
        const declarationsIn = (input: Record<string, string>) =>
            cssWriter({ fallback }).declarations(wide.permutation(input)).declarations;

        it("writes a line again only under @supports when only what is supported changes", () => {
            const [root, later] = cssBlocks([
                { declarations: declarationsIn({}), selector: ":root" },
                { declarations: declarationsIn({ mode: "dark" }), selector: '[data-mode="dark"]' },
            ]);
            expect(root?.underSupports.map(({ name }) => name)).toStrictEqual(["--brand"]);
            expect(written(later)).toStrictEqual([]);
            expect(later?.underSupports.map(({ supports }) => supports)).toStrictEqual([
                [
                    {
                        condition: "(color: color(display-p3 1 1 1))",
                        value: "color(display-p3 0 1 0)",
                    },
                ],
            ]);
        });
    });
});

describe("cssText", () => {
    const blocks = cssBlocks([
        { declarations: light, selector: ":root" },
        {
            declarations: dark,
            selector: ['[data-mode="dark"]', ".dark"],
            atRules: ["@media screen", "@supports (color: red)"],
        },
    ]);

    it("writes each block as a rule, nested in its at-rules", () => {
        expect(cssText(blocks)).toBe(
            [
                ":root {",
                "    --color-ink: #111111;",
                "    --color-paper: #ffffff;",
                "    --color-text: var(--color-ink);",
                "    --color-quote: var(--color-text);",
                "    --gap: 8px;",
                "}",
                "",
                "@media screen {",
                "    @supports (color: red) {",
                '        [data-mode="dark"],',
                "        .dark {",
                "            --color-ink: #eeeeee;",
                "            --color-text: var(--color-ink);",
                "            --color-quote: var(--color-text);",
                "        }",
                "    }",
                "}",
                "",
            ].join("\n"),
        );
    });

    it("writes nothing for blocks that declare nothing", () => {
        expect(cssText(cssBlocks([{ declarations: [], selector: ":root" }]))).toBe("");
    });
});
