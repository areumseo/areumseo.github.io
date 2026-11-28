# Technical Competency Map

A self-check page that links projects, stack, capabilities, concepts, evidence and learning tasks.

**This folder holds only the page shell and fictional sample data.** Real content lives outside this
public repository and is loaded in the browser with "개인 데이터 파일 열기". The file is read locally
and never uploaded; the page's Content-Security-Policy only allows requests to this site.

- `index.html`, `styles.css`, `app.js` — static page, no build step, no external fonts/CDN/analytics
- `sample-data.json` — fictional example in the same schema as the private data
- `fonts/` — self-hosted DM Sans / DM Mono / DM Serif Display (SIL OFL 1.1, see `fonts/OFL.txt`)
- Self-assessment is stored in `localStorage` (`tcm.assessment.v1`) with JSON export/import, kept separate from content data
- The page is `noindex` and not linked from the site menu, but that is not what keeps it private: the data never ships here

## Data schema (top-level arrays, linked by stable ids)

`areas`, `projects` (kind: `project` | `foundation`, `areaMarks`, `stackIds`, `capabilityIds`), `claims`
(`implementationStatus`: implemented | designed | planned | needs-clarification, `evidenceLevel`: described | linked | reproduced),
`outcomes` (value, unit, period, measurementDefinition, reportedBy, measuredAt), `stack`, `capabilities`,
`concepts` (`projectLinks[].level`: direct | related | unconfirmed), `evidence`, `architectures`
(`relationshipType`: actual | conceptual), `gaps`, `learningTasks`, `sources`. Unknown dates stay `null`.
