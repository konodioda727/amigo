&lt;!--
- Version change: 0.0.0 → 1.0.0
- Added sections:
  - I. Code Quality
  - II. Testing Standards
  - III. User Experience Consistency
  - IV. Performance Requirements
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md
  - ✅ .specify/templates/spec-template.md
  - ✅ .specify/templates/tasks-template.md
--&gt;
# Amigo Constitution

## Core Principles

### I. Code Quality
Code must be clear, maintainable, and well-documented. All contributions must adhere to the established coding standards defined in the project's linter configuration. Rationale: High code quality reduces bugs, lowers maintenance costs, and enables faster and more effective collaboration.

### II. Testing Standards
All new features must be accompanied by comprehensive tests, and bug fixes must include regression tests. A minimum of 80% test coverage is required for all new code. Tests should be written to be robust and meaningful, validating not just the "happy path" but also edge cases and potential failures. Rationale: Rigorous testing ensures stability, prevents regressions, and provides a safety net for future refactoring and feature development.

### III. User Experience Consistency
The user interface and user interactions must be consistent across the entire application. All UI components and user-facing workflows must follow the established design system and interaction patterns. Rationale: Consistency reduces user confusion, improves usability, and strengthens the user's trust in the application.

### IV. Performance Requirements
The application must be responsive and efficient. All code should be written with performance in mind. Critical user flows must be benchmarked and optimized to meet defined performance targets. Any code that could significantly impact performance must be identified and reviewed. Rationale: A performant application provides a better user experience and can scale more effectively.

## Governance

Amendments to this constitution require a formal proposal and review by the project maintainers. Any changes must be documented, and a migration plan must be created if the changes impact existing code or workflows. All pull requests and code reviews must verify compliance with these principles.

**Version**: 1.0.0 | **Ratified**: 2025-11-19 | **Last Amended**: 2025-11-19
