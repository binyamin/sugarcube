// A cleanup script that removes every token nothing references, in any theme.
import { type Project } from "@sugarcube-sh/dtcg";
import { remove, commit } from "@sugarcube-sh/dtcg-edit";

declare let project: Project;

const unused = project.doc
    .tokenPaths()
    .filter((path) => project.doc.referencedBy(path).length === 0);
for (const path of unused) {
    const done = commit(project, remove(project, path));
    if ("project" in done) project = done.project;
}
