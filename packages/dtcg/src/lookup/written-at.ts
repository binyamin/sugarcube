import type { Document, PlaceInPermutations, Span } from "../index.js";
import { group, token } from "./token.js";

export function writtenAtIn(doc: Document, path: string): PlaceInPermutations[] {
    const found = new Map<Span, PlaceInPermutations>();
    for (const permutation of doc.permutations) {
        const places = [
            ...(token(permutation, path)?.writtenAt ?? []),
            ...(group(permutation, path)?.writtenAt ?? []),
        ];
        for (const { source, span } of places) {
            const known = found.get(span);
            if (!known) {
                found.set(span, { span, sources: [source], permutations: [permutation.input] });
                continue;
            }
            if (!known.sources.includes(source)) known.sources.push(source);
            if (!known.permutations.includes(permutation.input)) {
                known.permutations.push(permutation.input);
            }
        }
    }
    return [...found.values()];
}
