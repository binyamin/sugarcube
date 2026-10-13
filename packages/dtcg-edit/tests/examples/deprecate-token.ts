// Deprecates a token with a message pointing at its replacement, then lists deprecated tokens still
// in use.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { deprecate, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const done = commit(ds, deprecate(ds, "color.old", "Use color.new instead"));
if ("ds" in done) ds = done.ds;

for (const t of ds.permutation().tokens) {
    if (!t.deprecated) continue;
    const users = new Set<string>();
    for (const reference of ds.referencedBy(t.path)) users.add(reference.from);
    if (users.size) {
        comment(`${t.path} is deprecated (${t.deprecated}) but used by ${[...users].join(", ")}`);
    }
}
