// Builds a map of which tokens reference which, and in which themes, then counts the tokens nothing
// references.
import { type DesignSystem } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;

const references = ds.tokenPaths().flatMap((path) => ds.references(path));
const referenced = new Set(references.map(({ path }) => path));
const unusedPrimitives = ds.permutation().tokens.filter((t) => !referenced.has(t.path));
row(references.length, unusedPrimitives.length);
