// A cleanup script that removes every token nothing references, in any theme.
import { byToken, referrers, type Project } from "@sugarcube-sh/dtcg";
import { remove, commit } from "@sugarcube-sh/dtcg-edit";

declare let project: Project;

const unused = byToken(project.doc).filter((t) => referrers(project.doc, t.path).length === 0);
for (const { path } of unused) {
    const done = commit(project, remove(project, path));
    if ("project" in done) project = done.project;
}
