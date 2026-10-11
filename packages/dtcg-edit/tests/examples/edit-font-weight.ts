// Changes only the font weight of a typography token, leaving its other four properties as written.
import { type Project } from "@sugarcube-sh/dtcg";
import { setValue, commit } from "@sugarcube-sh/dtcg-edit";

declare let project: Project;

const done = commit(project, setValue(project, "type.heading", 700, { part: ["fontWeight"] }));
if ("project" in done) project = done.project;
if ("refused" in done) showMessage(done.refused.reason);
