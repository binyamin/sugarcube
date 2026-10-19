import type { Token } from "@sugarcube-sh/dtcg";
import { tokenRow } from "../controllers/views";
import { Showing } from "./Showing";
import { AsCSS, Written } from "./Value";

export function TokenPage({ token }: { token: Token }) {
    const row = tokenRow(token, token.path);
    return (
        <article>
            <h1>{token.path}</h1>
            {token.description && <p>{token.description}</p>}
            <Showing />
            <dl>
                <dt>Type</dt>
                <dd>{token.type}</dd>
                <dt>Value</dt>
                <dd>
                    <Written value={row.written} />
                </dd>
                <dt>CSS</dt>
                <dd>
                    <AsCSS type={row.type} css={row.css} />
                </dd>
            </dl>
        </article>
    );
}
