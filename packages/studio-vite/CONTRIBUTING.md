# Contributing to @sugarcube-sh/studio-vite

One file, `src/index.ts`, in two parts: `filesFromSugarcube`, the plugin that finds the sugarcube
plugin's context at `configResolved` and hands studio its files from it, and the default export,
which mounts a devframes hub with the studio definition and the page script. There are no options:
the hub is the one host this package provides. studio reads whatever the sugarcube plugin last read,
with the config's problems; a save writes the files with `dtcg-edit`'s `applyToDisk`; a change on
disk comes back through the plugin's own watcher.

To run studio's own dev server against the demo instead, work in
`packages/studio` (`pnpm dev` there); this package is for a host app's config.

Tests: `pnpm test` here runs `tests/index.test.ts` against a fake plugin
context. Remember to rebuild (`pnpm build`) after changing the source; the host
app loads `dist`.
