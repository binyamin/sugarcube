// Builds a map of which tokens reference which, and in which themes, then counts the tokens nothing
// references.
import { tokenPaths, type Document } from "@sugarcube-sh/dtcg";

declare const doc: Document;

const references = tokenPaths(doc).flatMap((path) => doc.references(path));
const referenced = new Set(references.map(({ path }) => path));
const unusedPrimitives = (doc.permutations[0]?.tokens ?? []).filter((t) => !referenced.has(t.path));
row(references.length, unusedPrimitives.length);
