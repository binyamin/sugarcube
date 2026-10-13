import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type DesignSystem, type Permutation, read, readFromMemory } from "../../src/index.js";
import { type CaseOptions, inputFiles, readOptions } from "./case-options.js";
import { withSpans } from "./positions.js";

interface Expected {
    entry: string;
    spec?: string;
    options?: CaseOptions;
    files?: string[];
    sources?: unknown[];
    resolver?: DesignSystem["resolver"];
    permutations?: Partial<DesignSystem["permutations"][number]>[];
    diagnostics: Pick<
        DesignSystem["diagnostics"][number],
        "kind" | "detail" | "span" | "related" | "path" | "permutations"
    >[];
}

const casesFolder = join(import.meta.dirname, "cases");
const cases = readdirSync(casesFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

function observed(found: DesignSystem, expected: Expected) {
    const doc: DesignSystem = JSON.parse(JSON.stringify(found));
    return {
        entry: expected.entry,
        spec: expected.spec,
        ...(expected.options && { options: expected.options }),
        ...(expected.files && { files: doc.files }),
        ...(expected.sources && { sources: doc.sources }),
        ...(expected.resolver && { resolver: doc.resolver }),
        ...(expected.permutations && {
            permutations: doc.permutations.map((permutation, index) =>
                observedPermutation(permutation, expected.permutations?.[index]),
            ),
        }),
        diagnostics: doc.diagnostics.map(({ kind, detail, span, related, path, permutations }) => ({
            kind,
            detail,
            ...(span && { span }),
            ...(related && { related }),
            ...(path !== undefined && { path }),
            ...(permutations !== undefined && { permutations }),
        })),
    };
}

function observedPermutation(
    permutation: DesignSystem["permutations"][number],
    expected: Partial<DesignSystem["permutations"][number]> = {},
) {
    const { input, label, sources, tokens, groups } = permutation;
    return {
        ...(!expected.tokens && !expected.groups && { input, label, sources }),
        ...("input" in expected && { input }),
        ...("label" in expected && { label }),
        ...("sources" in expected && { sources }),
        ...(expected.tokens && { tokens: picked(tokens, expected.tokens) }),
        ...(expected.groups && { groups: picked(groups, expected.groups) }),
    };
}

function picked<T extends { path: string }>(found: T[], wanted: Partial<T>[]) {
    return found.map((each) => {
        const expected: Record<string, unknown> =
            wanted.find((one) => one.path === each.path) ?? each;
        const present = Object.entries(each).filter(([key]) => key in expected);
        const absent = Object.keys(expected)
            .filter((key) => expected[key] === null && !(key in each))
            .map((key) => [key, null]);
        return Object.fromEntries([...present, ...absent]);
    });
}

describe.each(cases)("%s", (name) => {
    const folder = join(casesFolder, name);
    const input = join(folder, "input");
    const expected = withSpans(
        JSON.parse(readFileSync(join(folder, "expected.json"), "utf8")),
        inputFiles(input),
    ) as Expected;

    it("reads through read", async () => {
        const doc = await read(expected.entry, {
            ...readOptions(expected.options),
            readText: (path) => readFile(join(input, path), "utf8"),
        });
        expect(observed(doc, expected)).toStrictEqual(expected);
    });

    it("reads through readFromMemory", () => {
        const doc = readFromMemory(
            { files: inputFiles(input), entry: expected.entry },
            readOptions(expected.options),
        );
        expect(observed(doc, expected)).toStrictEqual(expected);
    });

    it("names each problem's permutations among those that read its file", () => {
        const doc = readFromMemory(
            { files: inputFiles(input), entry: expected.entry },
            readOptions(expected.options),
        );
        const reads = (permutation: Permutation, file: string) =>
            permutation.sources.some((source) => source.file === file);
        const misplaced = doc.diagnostics.flatMap((problem) => {
            const file = problem.span?.file;
            if (file === undefined) return [];
            const readers = doc.permutations.filter((each) => reads(each, file));
            const fits = problem.permutations
                ? problem.permutations.every((each) => reads(each, file))
                : readers.length === 0 || readers.length === doc.permutations.length;
            return fits ? [] : [`${problem.kind} in ${file}`];
        });
        expect(misplaced).toStrictEqual([]);
    });

    it("names a value's problem in exactly the permutations whose token takes that value", () => {
        const doc = readFromMemory(
            { files: inputFiles(input), entry: expected.entry },
            readOptions(expected.options),
        );
        const inValue = (problem: DesignSystem["diagnostics"][number]) =>
            problem.kind === "invalid-value" ||
            problem.kind === "hex-string-color" ||
            (problem.kind === "unknown-property" &&
                "jsonPath" in problem.detail &&
                problem.detail.jsonPath[0] === "$value");
        const misplaced = doc.diagnostics.flatMap((problem) => {
            const { path, span } = problem;
            if (!inValue(problem) || path === undefined || span === undefined) return [];
            if (!doc.permutations.some((each) => each.token(path))) return [];
            const takes = (permutation: Permutation) => {
                const from = permutation.token(path)?.valueFrom.span;
                return (
                    from !== undefined &&
                    from.file === span.file &&
                    from.offset <= span.offset &&
                    span.offset + span.length <= from.offset + from.length
                );
            };
            const named = problem.permutations ?? doc.permutations;
            const taking = doc.permutations.filter(takes);
            const exact =
                named.length === taking.length && named.every((each) => taking.includes(each));
            return exact ? [] : [`${problem.kind} at ${path}`];
        });
        expect(misplaced).toStrictEqual([]);
    });
});
