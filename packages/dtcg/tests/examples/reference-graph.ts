// Builds a map of which tokens reference which, and in which themes, then counts the tokens nothing
// references.
import { type DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;

const references = tokens.tokenPaths().flatMap((path) => tokens.references(path));
const referenced = new Set(references.map(({ path }) => path));
const unusedPrimitives = tokens.permutation().tokens.filter((t) => !referenced.has(t.path));
row(references.length, unusedPrimitives.length);
