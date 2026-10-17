// Builds a map of which tokens reference which, and in which themes, then counts the tokens nothing
// references.
import { type DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;

const paths = tokens.tokenPaths();
const references = paths.flatMap((path) => tokens.references(path));
const unused = paths.filter((path) => tokens.usedBy(path).length === 0);
row(references.length, unused.length);
