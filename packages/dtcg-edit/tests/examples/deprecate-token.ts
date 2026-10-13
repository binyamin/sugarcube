// Deprecates a token with a message pointing at its replacement, then lists deprecated tokens still
// in use.
import { type Project } from "@sugarcube-sh/dtcg";
import { deprecate, commit } from "@sugarcube-sh/dtcg-edit";

declare let project: Project;

const done = commit(project, deprecate(project, "color.old", "Use color.new instead"));
if ("project" in done) project = done.project;

for (const t of project.doc.permutation().tokens) {
    if (!t.deprecated) continue;
    const users = new Set<string>();
    for (const reference of project.doc.referencedBy(t.path)) users.add(reference.from);
    if (users.size) {
        comment(`${t.path} is deprecated (${t.deprecated}) but used by ${[...users].join(", ")}`);
    }
}
