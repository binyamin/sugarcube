// A cleanup script that removes every token nothing references, in any theme.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { remove, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const unused = ds.tokenPaths().filter((path) => ds.referencedBy(path).length === 0);
for (const path of unused) {
    const done = commit(ds, remove(ds, path));
    if ("ds" in done) ds = done.ds;
}
