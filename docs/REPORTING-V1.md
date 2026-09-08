# Yagoya Reporting V1

## Purpose

Reporting V1 creates meeting-ready and accounting-friendly output from existing Yagoya operational data without turning day-to-day workspaces into long dashboards.

## Role access

### Merchant
- Sales Report
- Sales & Settlement Statement
- Print / Save PDF
- CSV export

Merchant reports are scoped to the active merchant workspace.

### Yagoya Admin
- Operations & Quality Report
- All-merchant or single-merchant scope
- Date-range filter
- Print / Save PDF
- CSV export

The default Admin report is exception-focused: quality, settlement, dispatch and open support issues appear before routine merchant summaries.

### Yagoya Owner
- Operations & Quality business report
- All-merchant or single-merchant scope
- Date-range filter
- Print / Save PDF
- CSV export

Privileged audit remains a separate governance record and is not automatically included in a business report.

## Financial integrity

Settlement output reports only events that Yagoya has actually recorded. A sales total is not treated as proof that a bank payout occurred. If no payout event exists for the selected period, the statement says so explicitly.

Money remains integer cents in application state. Formatted ZAR values are generated only for presentation.

## Current prototype boundary

The local browser repository intentionally returns bounded pages. Reporting V1 therefore demonstrates the report contract and UX against bounded data. Production high-volume reporting should use indexed server-side queries or dedicated reporting jobs that:

1. authorize the authenticated actor and merchant scope;
2. query the complete requested period using bounded pagination;
3. generate an immutable report snapshot / report ID where financial evidence is required;
4. stream or store CSV/PDF output outside the browser when volume warrants it;
5. audit sensitive platform or settlement report generation as required.

The browser print flow opens a clean standalone report document. The browser's print dialog provides physical printing or Save as PDF without printing the Yagoya application chrome.
