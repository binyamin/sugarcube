import { describe, expect, it } from "vitest";
import { type Span, group, permutation, readFromMemory, token } from "../../src/index.js";

const color = (red: number) => ({ $value: { colorSpace: "srgb", components: [red, 0, 0] } });

const files: Record<string, string> = {
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
        ],
    }),
    "base.json": JSON.stringify({
        color: { $type: "color", bg: color(1), text: color(0) },
    }),
    "dark.json": JSON.stringify({ color: { bg: color(0.1) } }),
};

const doc = readFromMemory({ files, entry: "tokens.resolver.json" });
const light = permutation(doc, { mode: "light" });
const dark = permutation(doc, { mode: "dark" });
const mode = doc.resolver?.modifiers[0];
const [lightContext, darkContext] = mode?.contexts ?? [];

function written(span: Span): string {
    return (files[span.file] ?? "").slice(span.offset, span.offset + span.length);
}

describe("sources", () => {
    it("are one object per source the resolver lists, shared by every permutation that reads it", () => {
        expect(light?.sources[0]).toBe(dark?.sources[0]);
        expect(doc.sources).toStrictEqual([dark?.sources[0], dark?.sources[1]]);
    });

    it("say the context they are listed under, as the resolver's own context object", () => {
        const [base, darkFile] = doc.sources;
        expect(base?.context).toBeUndefined();
        expect(darkFile?.context).toBe(darkContext);
    });

    it("say every set on the way, outermost first, and none when there is none", () => {
        const [base, darkFile] = doc.sources;
        expect(base?.sets.map(({ name }) => name)).toStrictEqual(["base"]);
        expect(darkFile?.sets).toStrictEqual([]);
        expect(base).not.toHaveProperty("from");
    });

    it("say who reads them: everyone, or the contexts that do", () => {
        const [base, darkFile] = doc.sources;
        expect(base?.readBy).toBe("everyone");
        expect(darkFile?.readBy).toStrictEqual([darkContext]);
    });

    it("are a token file's one source when there is no resolver", () => {
        const single = readFromMemory({ files: { "tokens.json": JSON.stringify({}) } });
        const [only] = single.sources;
        expect(only?.file).toBe("tokens.json");
        expect(only?.sets).toStrictEqual([]);
        expect(only?.readBy).toBe("everyone");
    });
});

describe("contexts", () => {
    it("know their modifier, and whether they are its default (Resolver 4.1.5.3)", () => {
        expect(darkContext?.modifier).toBe(mode);
        expect(darkContext?.name).toBe("dark");
        expect(lightContext?.isDefault).toBe(true);
        expect(darkContext?.isDefault).toBe(false);
    });

    it("are none a modifier's default when it declares none (Resolver 6)", () => {
        const undecided = readFromMemory({
            files: {
                ...files,
                "tokens.resolver.json": JSON.stringify({
                    version: "2025.10",
                    resolutionOrder: [
                        {
                            type: "modifier",
                            name: "mode",
                            contexts: {
                                light: [{ $ref: "base.json" }],
                                dark: [{ $ref: "dark.json" }],
                            },
                        },
                    ],
                }),
            },
            entry: "tokens.resolver.json",
        });
        const contexts = undecided.resolver?.modifiers[0]?.contexts ?? [];
        expect(contexts.map(({ isDefault }) => isDefault)).toStrictEqual([false, false]);
    });

    it("are the ones each permutation picks, one per modifier (Resolver 5)", () => {
        expect(light?.contexts).toStrictEqual([lightContext]);
        expect(dark?.contexts[0]).toBe(darkContext);
    });
});

describe("a token's writtenAt", () => {
    it("is where it is written, with the source that writes it", () => {
        const [place, ...rest] = (light && token(light, "color.text")?.writtenAt) ?? [];
        expect(rest).toStrictEqual([]);
        expect(place?.source).toBe(doc.sources[0]);
        expect(place && written(place.span)).toContain('"colorSpace"');
        expect(place?.span.file).toBe("base.json");
    });

    it("is every place a permutation's sources write it, the one that wins last", () => {
        const places = (dark && token(dark, "color.bg")?.writtenAt) ?? [];
        expect(places.map(({ source }) => source.file)).toStrictEqual(["base.json", "dark.json"]);
    });

    it("is the same places in every permutation that reads the same files", () => {
        const inLight = light && token(light, "color.text")?.writtenAt;
        const inDark = dark && token(dark, "color.text")?.writtenAt;
        expect(inLight?.[0]).toBe(inDark?.[0]);
    });
});

describe("a group's writtenAt", () => {
    it("is every place a source declares it, in the order read", () => {
        const places = (dark && group(dark, "color")?.writtenAt) ?? [];
        expect(places.map(({ source }) => source.file)).toStrictEqual(["base.json", "dark.json"]);
    });

    it("is empty for a group that is only inherited", () => {
        const inherited = readFromMemory({
            files: {
                "tokens.json": JSON.stringify({
                    button: { $type: "number", state: { hover: { $value: 1 } } },
                    primary: { $extends: "{button}" },
                }),
            },
        });
        expect(group(inherited, "primary.state")?.writtenAt).toStrictEqual([]);
    });

    it("of the top level is the top of each file that writes there", () => {
        expect(dark?.root.writtenAt.map(({ source }) => source.file)).toStrictEqual([
            "base.json",
            "dark.json",
        ]);
    });
});

describe("on the Document", () => {
    it("writtenAt gives every place a path is written, in any permutation, each once with where", () => {
        const places = doc.writtenAt("color.bg");
        expect(places.map(({ source, permutations }) => [source.file, permutations])).toStrictEqual(
            [
                ["base.json", [{ mode: "light" }, { mode: "dark" }]],
                ["dark.json", [{ mode: "dark" }]],
            ],
        );
    });

    it("writtenAt gives a group's places too", () => {
        expect(doc.writtenAt("color").map(({ source }) => source.file)).toStrictEqual([
            "base.json",
            "dark.json",
        ]);
    });
});

describe("the plain form", () => {
    const plain = JSON.parse(JSON.stringify(doc));

    it("writes each source once, on the Document, and each permutation's sources by position", () => {
        expect(plain.sources.map(({ file }: { file: string }) => file)).toStrictEqual([
            "base.json",
            "dark.json",
        ]);
        expect(
            plain.permutations.map(({ sources }: { sources: number[] }) => sources),
        ).toStrictEqual([[0], [0, 1]]);
    });

    it("writes a place as its source's position and its span", () => {
        const bg = plain.permutations[1].tokens.find(
            ({ path }: { path: string }) => path === "color.bg",
        );
        expect(bg.writtenAt.map(({ source }: { source: number }) => source)).toStrictEqual([0, 1]);
        expect(bg).not.toHaveProperty("source");
        expect(bg).not.toHaveProperty("replaces");
    });

    it("writes a context link as its modifier and name, and a modifier's contexts in full", () => {
        expect(plain.sources[1].context).toStrictEqual({ modifier: "mode", name: "dark" });
        expect(plain.sources[1].readBy).toStrictEqual([{ modifier: "mode", name: "dark" }]);
        const [, darkWritten] = plain.resolver.modifiers[0].contexts;
        expect(Object.keys(darkWritten).sort()).toStrictEqual(["at", "name", "sources"]);
    });

    it("leaves out a permutation's contexts, which its input says", () => {
        expect(plain.permutations[1]).not.toHaveProperty("contexts");
    });
});
