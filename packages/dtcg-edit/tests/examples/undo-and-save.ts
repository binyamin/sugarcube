// An editor's undo history. Every edit is kept so it can be undone, and the kept edits are what
// gets saved.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { createSession, rename, setValue } from "@sugarcube-sh/dtcg-edit";

declare const opened: DesignSystem;
declare function sendSave(edits: string): Promise<boolean>;

const session = createSession(opened);
session.do(setValue(session.ds, "color.brand", "#f43f5e"));
session.do(rename(session.ds, "color.danger", "error"));
session.undo();

if (await sendSave(JSON.stringify(session.unsaved))) session.saved();
