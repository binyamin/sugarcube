// Applies the safe fixes by itself, and asks a person before applying each of the rest.
import { type Project } from "@sugarcube-sh/dtcg";
import { commit, fix, fixesFor } from "@sugarcube-sh/dtcg-edit";

declare let project: Project;
declare function confirm(question: string): Promise<boolean>;

const errors = project.doc.diagnostics.filter((each) => each.severity === "error");
for (const d of errors) {
    for (const offered of fixesFor(project, d)) {
        if (!offered.safe && !(await confirm(`${d.message}: ${offered.title}?`))) continue;
        const done = commit(project, fix(project, [offered]));
        if ("project" in done) project = done.project;
    }
}
