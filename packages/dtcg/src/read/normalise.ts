import type { Diagnostic, Input, ResolverContext, Source, TokenType } from "../index.js";
import { diagnostic, foundInPermutation, type Problems } from "./diagnostics.js";
import { applyExtends } from "./extends.js";
import { inherited } from "./inherit.js";
import { type Merged, type MergedToken, merge } from "./merge.js";
import { inWrittenOrder } from "./order.js";
import type { ValueRead, ValueReader } from "./parse-value.js";
import type { ListedSource, LoadedPermutation } from "./permutations.js";
import type { LoadedSource } from "./sources.js";
import { type SourceContents, walkSource } from "./walk.js";
import { withPosition } from "./linked.js";

export interface NormalisedToken {
    token: MergedToken;
    type?: TokenType;
    read?: ValueRead;
}

export interface NormalisedPermutation {
    input: Input;
    label: string;
    contexts: ResolverContext[];
    sources: Source[];
    merged: Merged;
    tokens: Map<string, NormalisedToken>;
}

// Walks each piece of each source once, then merges a permutation's pieces in resolution order
// into its tokens and groups.
export function normalisePermutations(
    permutations: LoadedPermutation[],
    readValue: ValueReader,
    diagnostics: Problems,
    generate: (merged: Merged, permutation: Input) => void,
): { permutations: NormalisedPermutation[]; sources: Source[] } {
    const walked = new Map<string, { contents?: SourceContents; problems: Diagnostic[] }>();
    const walk = (loaded: LoadedSource, permutation?: Input) => {
        const key = JSON.stringify([loaded.file, loaded.pointer, loaded.overriddenKeys]);
        let found = walked.get(key);
        if (!found) {
            const problems: Diagnostic[] = [];
            const contents = walkSource(loaded, problems);
            found = { contents, problems: diagnostics.foundAll(problems) };
            walked.set(key, found);
        }
        if (permutation) for (const each of found.problems) foundInPermutation(each, permutation);
        return found.contents;
    };
    const published = new Map<ListedSource, Source>();
    const publish = (listed: ListedSource): Source => {
        const found = published.get(listed);
        if (found) return found;
        const { source, pieces } = listed;
        const extensions = pieces.map((each) => walk(each)?.root.extensions).find(Boolean);
        const made = withPosition({ ...source, ...(extensions && { extensions }) }, published.size);
        published.set(listed, made);
        return made;
    };

    const normalised = permutations.map(({ input, label, contexts, sources }) => {
        const walkedPieces = sources.flatMap((each, source) =>
            each.pieces.map((piece) => ({ contents: walk(piece, input), source })),
        );
        const merged = merge(walkedPieces, input, diagnostics);
        applyExtends(merged, input, diagnostics);
        generate(merged, input);
        inWrittenOrder(merged);
        const tokens = new Map<string, NormalisedToken>();
        for (const token of merged.tokens.values()) {
            if (token.type === undefined && token.reference) {
                tokens.set(token.path, { token });
                continue;
            }
            const type = inherited(token, merged, "type");
            if (type === "unusable") continue;
            if (type === undefined) {
                const { span, path } = token;
                diagnostics.found(
                    diagnostic("missing-type", {}, { span, path, permutation: input }),
                );
                continue;
            }
            tokens.set(token.path, { token, type, read: readValue.read(token, type, input) });
        }
        return { input, label, contexts, sources: sources.map(publish), merged, tokens };
    });
    return { permutations: normalised, sources: [...published.values()] };
}
