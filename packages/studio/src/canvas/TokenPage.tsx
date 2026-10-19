import type { Token } from "@sugarcube-sh/dtcg";
import { overridable } from "@sugarcube-sh/dtcg-edit";
import { useState } from "react";
import { placeRows } from "../controllers/token-page";
import { problemRows, tokenRow } from "../controllers/views";
import { useStudioState } from "../providers/studio-context";
import { EditRow } from "./EditRow";
import { Showing } from "./Showing";
import { TokenActions } from "./TokenActions";
import { AsCSS } from "./Value";

export function TokenPage({ token, shown }: { token: Token; shown: boolean }) {
    const showing = useStudioState((state) => state.showing);
    const tokens = useStudioState((state) => state.tokens);
    const value = useStudioState((state) => state.value);
    const [adding, setAdding] = useState<readonly string[]>([]);
    const row = tokenRow(token, token.path, value);
    const offered = overridable(tokens, token.path);
    const problems = problemRows(tokens.diagnosticsFor(token.path));

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
                {problems.length > 0 && (
                    <>
                        <dt>Problems</dt>
                        <dd>
                            <ul>
                                {problems.map((problem) => (
                                    <li
                                        key={`${problem.kind} ${problem.message} ${problem.inPermutations}`}
                                    >
                                        {problem.message}
                                        {problem.inPermutations && ` (${problem.inPermutations})`}
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </>
                )}
                <dt>CSS</dt>
                <dd>
                    {shown ? <AsCSS type={row.type} css={row.css} /> : <>Not in {showing.label}</>}
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
            <TokenActions path={token.path} />
        </article>
    );
}
