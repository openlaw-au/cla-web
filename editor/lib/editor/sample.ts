/**
 * sample.ts
 *
 * Usage scope: The CLQ Proofing Editor's initial-document sample text — imported by the
 * `ProofingEditor` React component to seed the editor on first mount, the same way the legacy
 * `editor/app.js` booted itself.
 *
 * Purpose: Verbatim port of the `SAMPLE` markdown constant previously inlined in the legacy
 * `editor/app.js` (lines 238-245). Exercises both CLQ-specific markdown extensions (an inline
 * `^[...]` footnote and a `[...]{.smallcaps}` span) plus a blockquote and heading, so mounting
 * the editor with this document is itself a smoke test of the parse → render round trip.
 *
 * Protocol: keep this string byte-for-byte identical to `editor/app.js` lines 238-245 until that
 * file is removed; any divergence changes what proofreaders see on first load. Do not modify
 * `editor/app.js`.
 */

/** The CLQ Proofing Editor's initial sample document, as Markdown source. */
export const SAMPLE = `# Recent developments in financial services law

This outline reviews several developments in financial services law, beginning with the shift from public to private markets.^[As to the United States, see RB Thompson and DC Langevoort, 'Redrawing the Public/Private Boundaries' (2013) 98 *Cornell L Rev* 1573.]

**Public and private markets** There is a real issue as to a shift from public to private markets. In *Australian Securities and Investments Commission v American Express Australia Ltd* the Federal Court imposed a penalty on [ASIC]{.smallcaps}'s respondents.^[[2024] FCA 784.]

> Absent clear language, the effect of termination will ordinarily only confer a right to terminate on the non-defaulting party.
`;
