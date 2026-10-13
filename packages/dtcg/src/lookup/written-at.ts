import type { Document, Place, PlaceInPermutations } from "../index.js";
import { group, token } from "./token.js";

export function writtenAtIn(doc: Document, path: string): PlaceInPermutations[] {
    const found = new Map<Place, PlaceInPermutations>();
    for (const permutation of doc.permutations) {
        const places = [
            ...(token(permutation, path)?.writtenAt ?? []),
            ...(group(permutation, path)?.writtenAt ?? []),
        ];
        for (const place of places) {
            const known = found.get(place);
            if (known) known.permutations.push(permutation.input);
            else
                found.set(place, {
                    source: place.source,
                    span: place.span,
                    permutations: [permutation.input],
                });
        }
    }
    return [...found.values()];
}
