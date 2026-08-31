# System Area Page-by-Page Refactor Plan

**Status:** Users page implemented; remaining page requirements pending analysis  
**Branch:** `codex/system-area-refactor`  
**Scope:** Blocks Web System administration area

## Goal

Refactor System area one page at a time. Do not change a page until its workflow, functionality, states, and visual direction are analyzed and approved.

## Working Rules

- Keep each page independently reviewable and testable.
- Analyze and approve one page before implementation starts.
- Preserve existing routes and API contracts unless page analysis explicitly approves a change.
- Use installed shadcn/ui primitives and existing Blocks Web tokens.
- Cover loading, empty, error, success, disabled, and permission-denied states where applicable.
- Verify desktop and mobile behavior after each page.
- Use `browser-use` first for user-journey verification.
- Record implementation status and evidence in this task folder when execution begins.

## Page Sequence

### 0. Shared System Area Baseline

- [ ] Audit System navigation, page shell, headings, spacing, responsive behavior, and shared table/form patterns.
- [ ] Decide shared changes that should land before individual pages.
- [ ] Confirm page order after dependency review.

### 1. System Overview — `/system/overview`

- [ ] Analyze user goal and current registration-settings workflow.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 2. Audit Log — `/system/audit-log`

- [ ] Analyze search, filtering, event inspection, pagination, and evidence needs.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 3. Users And Invitations — `/system/identity/users`

- [x] Analyze account management and invitation workflows.
- [x] Define required workflow and functionality changes.
- [x] Approve layout, states, responsive behavior, and accessibility behavior.
- [x] Implement approved changes with focused tests.
- [x] Run browser verification and record result.

### 4. Roles And Permissions — `/system/identity/roles`

- [ ] Analyze role lifecycle and permission-assignment workflow.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 5. Menus — `/system/identity/menus`

- [ ] Analyze menu hierarchy, permission mapping, and editing workflow.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 6. System Groups — `/system/identity/system-groups`

- [ ] Analyze group hierarchy and editing workflow.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 7. Cross-Page Completion

- [ ] Review shared navigation and page-to-page consistency.
- [ ] Run affected frontend tests and production build.
- [ ] Run complete System-area browser journey at desktop and mobile sizes.
- [ ] Complete accessibility and experience-quality review.
- [ ] Record final PASS, NOT APPLICABLE, or BLOCKED evidence.

## Per-Page Analysis Template

Complete this before editing each page:

1. Primary user and goal.
2. Current pain points.
3. Required workflow changes.
4. Required functionality changes.
5. Information hierarchy and primary action.
6. Loading, empty, error, success, and permission states.
7. Desktop and mobile layout.
8. Accessibility requirements.
9. API or backend impact.
10. Acceptance criteria and browser journey.

## Current Boundary

Users and Invitations page is approved and implemented. Next action: analyze Shared System Area Baseline or select another page for detailed analysis.
