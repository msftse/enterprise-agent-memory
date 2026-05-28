# Token Economy UX Feature

Branch: `feat/token-economy-ux`

Stitch project: `projects/1726830399889567547`
Stitch design system: `assets/6020353411963312393`

## Objective

Add a Token Economy area to the EAM management portal that explains the value of memory compression and recall at both company and user levels.

The screen should answer three questions quickly:

- How many tokens did EAM absorb, compress, and save?
- Where are savings coming from across users, teams, projects, and models?
- Which users and projects should be investigated or optimized next?

## UX Principles

- Show a clear value story before detailed diagnostics.
- Support fast switching between company and user perspectives.
- Keep tenant, scope, and date range visible near the top of the page.
- Prefer compact analytic cards and dense readable tables over decorative visuals.
- Make fallback and empty states explicit when token telemetry is incomplete.

## Company-Level Metrics

| Metric | Definition | Primary visualization |
| --- | --- | --- |
| Source tokens | Raw observation tokens received by EAM | KPI card and token flow chart |
| Compressed memory tokens | Tokens stored after compression into observations or memories | KPI card and token flow chart |
| Saved recall tokens | Estimated tokens avoided by reusing memory in later sessions | KPI card and savings trend |
| Estimated USD saved | Saved recall tokens multiplied by configured model cost assumptions | KPI card and trend |
| Compression ratio | Source tokens divided by compressed memory tokens | KPI card and histogram |
| Memory count | Number of stored memories in scope | KPI card |
| Recall count | Number of memory recalls in scope | KPI card |
| Active users | Unique users or agents contributing observations in the period | KPI card and leaderboard |
| Cost per 1K recalls | Estimated spend divided by recall volume | KPI card |
| Memory reuse rate | Recalls divided by active memories or memory-producing sessions | KPI card and trend |

## User-Level Metrics

| Metric | Definition | Primary visualization |
| --- | --- | --- |
| User source tokens | Raw observation tokens attributed to a selected user or agent | KPI card and token flow chart |
| User compressed tokens | Compressed observation and memory tokens for the user | KPI card and token flow chart |
| User saved tokens | Estimated avoided tokens from the user's memory recalls | KPI card and trend |
| User estimated savings | User saved tokens converted to USD | KPI card |
| Personal compression ratio | User source tokens divided by user compressed tokens | KPI card |
| Personal recalls | Number of recalls by the user | KPI card |
| Memory reuse rate | How often the user benefits from existing memory | KPI card |
| Top projects by savings | Projects where the user gets the most token savings | Bar chart or table |
| Recent session token flow | Session-level source, compressed, and saved token estimates | Detail table |

## Graphs

- Token flow: stacked or grouped bars for source, compressed, and saved tokens.
- Savings trend: line chart for saved tokens and estimated USD saved over time.
- Compression ratio distribution: histogram of memory or observation compression ratios.
- Leaderboard: users, teams, or projects ranked by saved tokens and compression ratio.
- Model cost mix: donut chart showing token cost contribution by model or deployment.
- Recent sessions: table showing session, project, source tokens, compressed tokens, saved tokens, and ratio.

## Data Sources

Preferred server-side sources:

- `/api/v1/savings/summary`
- `/api/v1/savings/compression-distribution`
- Future `/api/v1/savings/timeseries`
- Future `/api/v1/savings/leaderboard`
- Future `/api/v1/savings/model-mix`

Current management portal fallback:

- Sessions from `/api/v1/sessions`
- Observations from `/api/v1/sessions/:id/observations`
- Memories from `/api/v1/memories`
- Token estimates from text length when explicit token telemetry is unavailable

## Empty State

If no savings telemetry is available, show:

- Zeroed KPI cards with clear labels.
- A note that estimates will improve when raw token counts, recall counts, and model pricing are recorded by the API.
- The fallback source used for the current display.
