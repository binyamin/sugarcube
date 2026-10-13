// Adds a token to a group that already declares a type, so the new token doesn't repeat it.
import { type Project } from "@sugarcube-sh/dtcg";
import { create, commit } from "@sugarcube-sh/dtcg-edit";

declare let project: Project;

const colors = project.doc.permutation().group("color");
const done = commit(project, create(project, "color.info", { $value: "#0ea5e9" }));
if ("project" in done) project = done.project;
if (!colors?.type) showMessage("This group has no type; choose one");
