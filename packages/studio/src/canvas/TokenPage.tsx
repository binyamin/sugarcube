import type { Token } from "@sugarcube-sh/dtcg";
import { overridable } from "@sugarcube-sh/dtcg-edit";
import { useState } from "react";
import { placeRows } from "../controllers/token-page";
import { tokenRow } from "../controllers/views";
import { useStudioState } from "../providers/studio-context";
import { EditRow } from "./EditRow";
import { Showing } from "./Showing";
import { AsCSS } from "./Value";

export function TokenPage({ token }: { token: Token }) {
    const tokens = useStudioState((state) => state.tokens);
    const value = useStudioState((state) => state.value);
    const [adding, setAdding] = useState<readonly string[]>([]);
    const row = tokenRow(token, token.path, value);
    const offered = overridable(tokens, token.path);

    return (
        <article>
            <h1>{token.path}</h1>
            {token.description && <p>{token.description}</p>}
            <Showing />
            <dl>
                <dt>Type</dt>
                <dd>{token.type}</dd>
                {placeRows(tokens, token.path).map((place) => (
                    <EditRow
                        key={`${place.at.file}:${place.at.offset}`}
                        label={place.label}
                        value={place.value}
                        path={token.path}
                        where={{ at: place.at }}
                    />
                ))}
                {offered
                    .filter(({ label }) => adding.includes(label))
                    .map(({ label, input }) => (
                        <EditRow
                            key={label}
                            label={`Override for ${label}`}
                            value={undefined}
                            path={token.path}
                            where={{ input }}
                        />
                    ))}
                <dt>CSS</dt>
                <dd>
                    <AsCSS type={row.type} css={row.css} />
                </dd>
            </dl>
            {offered
                .filter(({ label }) => !adding.includes(label))
                .map(({ label }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => setAdding((labels) => [...labels, label])}
                    >
                        Override for {label}
                    </button>
                ))}
        </article>
    );
}
