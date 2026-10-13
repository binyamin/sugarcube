// Deprecates a token with a message pointing at its replacement, then lists deprecated tokens still
// in use.
import { defaultPermutation, referrers, type Project } from "@sugarcube-sh/dtcg";
import { deprecate, commit } from "@sugarcube-sh/dtcg-edit";

declare let project: Project;

const done = commit(project, deprecate(project, "color.old", "Use color.new instead"));
if ("project" in done) project = done.project;

for (const t of defaultPermutation(project.doc)?.tokens ?? []) {
    if (!t.deprecated) continue;
    const users = referrers(project.doc, t.path).map((r) => r.path);
    if (users.length) {
        comment(`${t.path} is deprecated (${t.deprecated}) but used by ${users.join(", ")}`);
    }
}
