# @sugarcube-sh/dtcg-edit

Change design token files written in the [DTCG format](https://www.designtokens.org/) without reformatting them.

Some of the API is still stubs, which throw "not implemented yet".

Every edit is followed by reading the result with [`@sugarcube-sh/dtcg`](../dtcg), so the new project reports any problem the edit leaves, as it would for a change made in a code editor. An edit that can't be written at all is refused, with the reason. Every edit also records what it expected to find, so replaying edits onto files that changed since, after a `git pull` or from a saved link, reports a conflict instead of overwriting someone else's change.

## Possible entries

| Import from | Holds | Runs in |
| --- | --- | --- |
| `@sugarcube-sh/dtcg-edit` | the operations, `apply` and `commit`, sessions, and checking edits that come from outside | anywhere |
| `@sugarcube-sh/dtcg-edit/node` | `applyToDisk`, which only writes the design system's own files, all or nothing | Node |
| `@sugarcube-sh/dtcg-edit/text` | edits to one JSON text that change nothing else | anywhere |

## How it works

1. `open`, from `@sugarcube-sh/dtcg`, reads a design system and keeps the text of its files. The result is a project.
2. An operation, such as `rename` or `setValue`, returns the file edits it needs. If it can't decide on its own, it returns a question. If it can't be done, it returns a refusal with the reason.
3. `apply` or `commit` makes the edits and returns a new project. The old one is left as it was, so undo is keeping the previous project.

A script can stop there. An editor usually wants more: the list of unsaved changes, saving, putting unsaved edits back after a reload, and taking in files that changed on disk. `createSession` keeps all of that for you. Undo and redo are still stubs.

## A few examples

Rename a token, updating every reference to it, and write the result to disk:

```ts
import { open } from "@sugarcube-sh/dtcg/node";
import { rename, commit } from "@sugarcube-sh/dtcg-edit";
import { applyToDisk } from "@sugarcube-sh/dtcg-edit/node";

const source = { entry: "tokens/tokens.resolver.json" };
const project = await open(source.entry);
const done = commit(project, rename(project, "color.brand", "primary"));
if ("ops" in done) await applyToDisk(source, done.ops);
```

Set a value for one context only, here `dark` of a modifier called `theme`. If more than one file could hold it, ask:

```ts
import { setValue, commit } from "@sugarcube-sh/dtcg-edit";

const dark = { theme: "dark" };
let done = commit(project, setValue(project, "color.danger", "#fca5a5", { context: dark }));

if ("decision" in done && done.decision.kind === "placement") {
    const file = await askPerson(done.decision.candidates);
    done = commit(project, setValue(project, "color.danger", "#fca5a5", { context: dark, place: file }));
}
```

Remove a token, and see which references it leaves pointing at nothing:

```ts
import { remove } from "@sugarcube-sh/dtcg-edit";

const result = remove(project, "color.legacy");
if ("ops" in result && result.broken?.length) console.log("still referred to by", result.broken);
```

Keep an editor's unsaved changes in a session, with ids that stay on a token through a rename:

```ts
import { createSession, rename, setValue } from "@sugarcube-sh/dtcg-edit";

const session = createSession(project);
const selected = session.idOf("color.danger");
session.do(setValue(session.project, "color.brand", "#f43f5e"));
session.do(rename(session.project, "color.danger", "error"));

session.pathOf(selected); // "color.error"
for (const change of session.changes()) console.log(change.kind, change.path);
```

Keep the unsaved edits across a page reload, and put them back onto files that may have changed since. Edits that come from outside, such as storage or a link, are checked with `isEdits` first:

```ts
import { isEdits } from "@sugarcube-sh/dtcg-edit";

sessionStorage.setItem("edits", JSON.stringify(session.unsaved));

const kept: unknown = JSON.parse(sessionStorage.getItem("edits") ?? "null");
if (isEdits(kept)) {
    for (const { path, yours, theirs } of session.restore(kept)) console.log(path, yours, theirs);
}
```

## Reading

To read, check and export tokens without editing them, see [`@sugarcube-sh/dtcg`](../dtcg).

## License

MIT. See [LICENSE.md](./LICENSE.md).
