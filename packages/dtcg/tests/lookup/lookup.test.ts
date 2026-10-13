import { describe, expect, it } from "vitest";
import {
    type Document,
    acrossPermutations,
    tokenPaths,
    completeInput,
    defaultPermutation,
    errors,
    group,
    modifier,
    permutation,
    permutationLabel,
    readFromMemory,
    token,
    tokensIn,
} from "../../src/index.js";

const px = (value: number) => ({ $value: { value, unit: "px" } });

const resolver = {
    version: "2025.10",
    sets: { base: { sources: [{ $ref: "base.json" }] } },
    modifiers: {
        theme: {
            contexts: { light: [], dark: [{ $ref: "dark.json" }] },
            default: "light",
        },
        density: {
            contexts: { comfy: [], compact: [{ $ref: "compact.json" }] },
            default: "comfy",
        },
    },
    resolutionOrder: [
        { $ref: "#/sets/base" },
        { $ref: "#/modifiers/theme" },
        { $ref: "#/modifiers/density" },
    ],
};

const files = {
    "tokens.resolver.json": JSON.stringify(resolver),
    "base.json": `{
        "px": { "$type": "dimension", "$value": { "value": 1, "unit": "px" } },
        "2": { "$type": "dimension", "$value": { "value": 2, "unit": "px" } },
        "1": { "$type": "dimension", "$value": { "value": 1, "unit": "px" } },
        "space": {
            "$type": "dimension",
            "$root": ${JSON.stringify(px(8))},
            "sm": ${JSON.stringify(px(4))},
            "inset": { "lg": ${JSON.stringify(px(16))} }
        },
        "spacer": { "$type": "dimension", "x": ${JSON.stringify(px(2))} }
    }`,
    "dark.json": `{
        "glow": { "$type": "dimension", "$value": { "value": 4, "unit": "px" } },
        "2": { "$type": "dimension", "$value": { "value": 3, "unit": "px" } }
    }`,
    "compact.json": `{ "space": { "sm": ${JSON.stringify(px(2))} } }`,
};

function readWith(inputs?: Document["permutations"][number]["input"][]): Document {
    return readFromMemory({ files, entry: "tokens.resolver.json" }, inputs && { inputs });
}

const doc = readWith();
const paths = (tokens: readonly { path: string }[] | undefined) => tokens?.map(({ path }) => path);
const valueOf = (found: ReturnType<typeof token>) =>
    found?.type === "dimension" ? found.resolved?.value : undefined;

describe("permutation", () => {
    it("finds the permutation for a full input", () => {
        expect(permutation(doc, { theme: "dark", density: "compact" })?.input).toStrictEqual({
            theme: "dark",
            density: "compact",
        });
    });

    it("gives modifiers left out their defaults (Resolver 5.1)", () => {
        expect(permutation(doc, { theme: "dark" })?.input).toStrictEqual({
            theme: "dark",
            density: "comfy",
        });
        expect(permutation(doc)?.input).toStrictEqual({ theme: "light", density: "comfy" });
    });

    it("matches modifier and context names case-insensitively (Resolver 5.1)", () => {
        expect(permutation(doc, { Theme: "DARK" })?.input).toStrictEqual({
            theme: "dark",
            density: "comfy",
        });
    });

    it("finds nothing for a modifier or context the resolver does not declare", () => {
        expect(permutation(doc, { mood: "calm" })).toBeUndefined();
        expect(permutation(doc, { theme: "sepia" })).toBeUndefined();
    });

    it("finds nothing for an input the read did not build", () => {
        const onlyDark = readWith([{ theme: "dark" }]);
        expect(permutation(onlyDark, { theme: "light" })).toBeUndefined();
    });

    it("finds nothing when a modifier with no default is left out", () => {
        const noDefault = readFromMemory({
            files: {
                ...files,
                "tokens.resolver.json": JSON.stringify({
                    ...resolver,
                    modifiers: { theme: { contexts: resolver.modifiers.theme.contexts } },
                    resolutionOrder: resolver.resolutionOrder.slice(0, 2),
                }),
            },
            entry: "tokens.resolver.json",
        });
        expect(permutation(noDefault)).toBeUndefined();
        expect(permutation(noDefault, { theme: "dark" })?.input).toStrictEqual({ theme: "dark" });
    });
});

describe("completeInput", () => {
    it("gives every modifier, defaults filled in and names as the resolver writes them", () => {
        expect(completeInput(doc, { Theme: "DARK" })).toStrictEqual({
            ok: true,
            input: { theme: "dark", density: "comfy" },
        });
    });

    it("says which modifier or context the resolver does not declare", () => {
        expect(completeInput(doc, { mood: "calm" })).toStrictEqual({
            ok: false,
            reason: "unknown-modifier",
            modifier: "mood",
        });
        expect(completeInput(doc, { theme: "sepia" })).toStrictEqual({
            ok: false,
            reason: "unknown-context",
            modifier: "theme",
            context: "sepia",
        });
    });

    it("says which modifier with no default was left out", () => {
        const noDefault = readFromMemory({
            files: {
                ...files,
                "tokens.resolver.json": JSON.stringify({
                    ...resolver,
                    modifiers: { theme: { contexts: resolver.modifiers.theme.contexts } },
                    resolutionOrder: resolver.resolutionOrder.slice(0, 2),
                }),
            },
            entry: "tokens.resolver.json",
        });

        expect(completeInput(noDefault, {})).toStrictEqual({
            ok: false,
            reason: "no-default",
            modifier: "theme",
        });
    });
});

describe("acrossPermutations", () => {
    it("gives the token in each permutation that has it, with the permutation and where its value comes from", () => {
        const across = acrossPermutations(doc, "2");

        expect(
            across.map((each) => ({ label: each.permutation.label, from: each.from })),
        ).toStrictEqual([
            { label: "theme: light, density: comfy", from: { sets: [{ name: "base" }] } },
            { label: "theme: light, density: compact", from: { sets: [{ name: "base" }] } },
            {
                label: "theme: dark, density: comfy",
                from: { modifier: "theme", context: "dark", sets: [] },
            },
            {
                label: "theme: dark, density: compact",
                from: { modifier: "theme", context: "dark", sets: [] },
            },
        ]);
        expect(across[2]?.permutation).toBe(permutation(doc, { theme: "dark" }));
        expect(across[2]?.token).toBe(token(doc, "2", { theme: "dark" }));
        expect(Object.keys(across[0] ?? {})).toStrictEqual(["permutation", "token", "from"]);
    });

    it("leaves out permutations that don't have the token", () => {
        expect(acrossPermutations(doc, "glow").map((each) => each.permutation.input)).toStrictEqual(
            [
                { theme: "dark", density: "comfy" },
                { theme: "dark", density: "compact" },
            ],
        );
        expect(acrossPermutations(doc, "nope")).toStrictEqual([]);
    });
});

describe("tokenPaths", () => {
    it("lists every token in any permutation once, in the order the permutations list them", () => {
        expect(tokenPaths(doc)).toStrictEqual([
            "px",
            "2",
            "1",
            "space.$root",
            "space.sm",
            "space.inset.lg",
            "spacer.x",
            "glow",
        ]);
    });

    it("is a list the caller may change", () => {
        const listed = tokenPaths(doc);
        listed.reverse();
        expect(tokenPaths(doc)[0]).toBe("px");
    });
});

describe("modifier", () => {
    it("finds a modifier that takes part by its name, whatever its case", () => {
        expect(modifier(doc, "Theme")).toMatchObject({ name: "theme", default: "light" });
        expect(modifier(doc, "theme")?.contexts.map(({ name }) => name)).toStrictEqual([
            "light",
            "dark",
        ]);
    });

    it("is undefined for a name the resolver doesn't use", () => {
        expect(modifier(doc, "brand")).toBeUndefined();
    });
});

describe("permutationLabel", () => {
    it("names each modifier and its context, in the order the resolver declares them", () => {
        expect(permutationLabel({ theme: "dark", density: "compact" })).toBe(
            "theme: dark, density: compact",
        );
    });

    it("is the label the read gives each permutation", () => {
        for (const each of doc.permutations) expect(permutationLabel(each.input)).toBe(each.label);
    });
});

describe("defaultPermutation", () => {
    it("is the permutation with every modifier at its default", () => {
        expect(defaultPermutation(doc)?.input).toStrictEqual({ theme: "light", density: "comfy" });
    });

    it("is undefined when the read did not build it", () => {
        expect(defaultPermutation(readWith([{ theme: "dark" }]))).toBeUndefined();
    });

    it("is the one permutation of a file read without a resolver", () => {
        const single = readFromMemory({ files: { "tokens.json": files["base.json"] } });
        expect(defaultPermutation(single)).toBe(single.permutations[0]);
    });
});

describe("token", () => {
    it("finds a token in the default permutation when no input is given", () => {
        expect(valueOf(token(doc, "2"))).toBe(2);
    });

    it("finds a token in the permutation an input names", () => {
        expect(valueOf(token(doc, "2", { theme: "dark" }))).toBe(3);
        expect(valueOf(token(doc, "space.sm", { density: "compact" }))).toBe(2);
    });

    it("uses the first permutation when there is no default one", () => {
        expect(valueOf(token(readWith([{ theme: "dark" }]), "2"))).toBe(3);
    });

    it("finds nothing for a path that is not a token in that permutation", () => {
        expect(token(doc, "glow")).toBeUndefined();
        expect(token(doc, "space")).toBeUndefined();
        expect(token(doc, "toString")).toBeUndefined();
        expect(token(doc, "2", { theme: "sepia" })).toBeUndefined();
    });

    it("finds a token in a permutation already in hand", () => {
        const dark = permutation(doc, { theme: "dark" });
        if (!dark) throw new Error("no dark permutation");
        expect(valueOf(token(dark, "2"))).toBe(3);
        expect(valueOf(token(dark, "glow"))).toBe(4);
        expect(token(dark, "toString")).toBeUndefined();
    });
});

describe("group", () => {
    it("finds a group by path, in the permutation an input names", () => {
        expect(group(doc, "space.inset")?.path).toBe("space.inset");
        expect(group(doc, "space", { theme: "dark" })?.type).toBe("dimension");
    });

    it("finds nothing for a path that is a token, not a group", () => {
        expect(group(doc, "space.sm")).toBeUndefined();
        expect(group(doc, "constructor")).toBeUndefined();
    });

    it("finds a group in a permutation already in hand", () => {
        const compact = permutation(doc, { density: "compact" });
        if (!compact) throw new Error("no compact permutation");
        expect(group(compact, "space")?.type).toBe("dimension");
        expect(group(compact, "space.sm")).toBeUndefined();
    });
});

describe("tokensIn", () => {
    it("lists a group's tokens and its subgroups' in file order, its $root included", () => {
        expect(paths(tokensIn(doc, "space"))).toStrictEqual([
            "space.$root",
            "space.sm",
            "space.inset.lg",
        ]);
    });

    it("leaves out a sibling whose name only starts the same way", () => {
        expect(paths(tokensIn(doc, "space"))).not.toContain("spacer.x");
    });

    it('takes "" as the group named "", never the top level of the files (Format 5.1)', () => {
        expect(tokensIn(doc, "")).toStrictEqual([]);
        const named = readFromMemory({
            files: {
                "tokens.json": JSON.stringify({
                    "": { $type: "number", x: { $value: 1 } },
                    "top": { $type: "number", $value: 2 },
                }),
            },
        });
        expect(paths(tokensIn(named, ""))).toStrictEqual([".x"]);
    });

    it("lists the tokens of the permutation an input names", () => {
        expect(valueOf(tokensIn(doc, "space", { density: "compact" })[1])).toBe(2);
    });

    it("is empty for a path that is not a group, or an input that matches nothing", () => {
        expect(tokensIn(doc, "space.sm")).toStrictEqual([]);
        expect(tokensIn(doc, "space", { theme: "sepia" })).toStrictEqual([]);
    });

    it("lists the tokens of a permutation already in hand", () => {
        const dark = permutation(doc, { theme: "dark" });
        if (!dark) throw new Error("no dark permutation");
        expect(paths(tokensIn(dark, "space"))).toStrictEqual([
            "space.$root",
            "space.sm",
            "space.inset.lg",
        ]);
    });
});

describe("errors", () => {
    it("keeps the errors and leaves out warnings, in the order they were found", () => {
        const checked = readFromMemory({
            files: {
                "tokens.json": JSON.stringify({
                    " spaced": { $type: "number", $value: 1 },
                    "first": { $type: "number", $value: "{missing.one}" },
                    "second": { $type: "number", $value: "{missing.two}" },
                }),
            },
        });
        expect(checked.diagnostics.map(({ kind }) => kind)).toContain("whitespace-in-name");
        expect(errors(checked).map(({ kind, path }) => [kind, path])).toStrictEqual([
            ["missing-reference", "first"],
            ["missing-reference", "second"],
        ]);
    });

    it("is empty when nothing stops the design system from being used", () => {
        expect(errors(readFromMemory({ files: { "tokens.json": "{}" } }))).toStrictEqual([]);
    });
});
