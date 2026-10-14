import type { DesignTokens, Permutation, PlaceInPermutations, Source, Span } from "../index.js";
import { permutationsOf } from "../read/permutations-of.js";

export function writtenAtIn(tokens: DesignTokens, path: string): PlaceInPermutations[] {
    const found = new Map<Span, { sources: Source[]; readIn: Permutation[] }>();
    for (const permutation of tokens.permutations) {
        const places = [
            ...(permutation.token(path)?.writtenAt ?? []),
            ...(permutation.group(path)?.writtenAt ?? []),
        ];
        for (const { source, span } of places) {
            const known = found.get(span);
            if (!known) {
                found.set(span, { sources: [source], readIn: [permutation] });
                continue;
            }
            if (!known.sources.includes(source)) known.sources.push(source);
            if (!known.readIn.includes(permutation)) known.readIn.push(permutation);
        }
    }
    return [...found].map(([span, { sources, readIn }]) => ({
        span,
        sources,
        readIn: permutationsOf(readIn, tokens.permutations),
        winsIn: permutationsOf(
            readIn.filter((permutation) => permutation.token(path)?.valueFrom.span === span),
            tokens.permutations,
        ),
    }));
}
