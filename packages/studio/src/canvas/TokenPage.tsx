import type { Token } from "@sugarcube-sh/dtcg";
import { useState } from "react";
import { valueView } from "../controllers/token-page";
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
    const view = valueView(tokens, token.path, adding);
    const problems = problemRows(tokens.diagnosticsFor(token.path));

    return (
        <article>
            <h1>{token.path}</h1>
            {token.description && <p>{token.description}</p>}
            <Showing />
            <dl>
                <dt>Type</dt>
                <dd>{token.type}</dd>
                {view.rows.map((each) => (
                    <EditRow key={each.key} row={each} type={token.type} path={token.path} />
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
            {view.offers.map((label) => (
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
