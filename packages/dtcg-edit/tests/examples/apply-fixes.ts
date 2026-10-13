// Applies the safe fixes by itself, and asks a person before applying each of the rest.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { commit, fix, fixesFor } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;
declare function confirm(question: string): Promise<boolean>;

const errors = ds.diagnostics.filter((each) => each.severity === "error");
for (const d of errors) {
    for (const offered of fixesFor(ds, d)) {
        if (!offered.safe && !(await confirm(`${d.message}: ${offered.title}?`))) continue;
        const done = commit(ds, fix(ds, [offered]));
        if ("ds" in done) ds = done.ds;
    }
}
