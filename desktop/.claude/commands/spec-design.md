# Spec Design Command

Generate design document based on approved requirements.

## Usage

```
/spec-design [feature-name]
```

## Instructions

You are working on the design phase of the spec workflow.

1. **Prerequisites**
   - Ensure requirements.md exists and is approved
   - Load the requirements document for context
   - **Load steering documents**: Check for and load tech.md and structure.md
   - Research existing codebase patterns and architecture

2. **Generate Design Document**
   - Create comprehensive design following the template
   - Include all required sections:
     - Overview
     - Architecture
     - Components and Interfaces
     - Data Models
     - Error Handling
     - Testing Strategy

3. **Codebase Research Phase** (MANDATORY)
   - **Map existing patterns**: Identify data models, API patterns, component structures that match your needs
   - **Cross-reference with tech.md**: Ensure patterns align with documented technical standards
   - **Catalog reusable utilities**: Find validation functions, helpers, middleware, hooks that can be leveraged
   - **Document architectural decisions**: Note existing tech stack, state management, routing patterns to follow
   - **Verify against structure.md**: Ensure file organization follows project conventions
   - **Identify integration points**: Map how new feature connects to existing auth, database, APIs
   - **Find similar implementations**: Look for features with similar requirements already implemented
   - **Note gaps**: Document what needs to be built vs. what can be reused or extended

4. **Design Content** (leverage codebase research and steering documents)
   - **Reuse Architecture**: Build on existing patterns rather than creating new ones
   - **Follow tech.md standards**: Ensure design adheres to documented technical guidelines
   - **Respect structure.md conventions**: Organize components according to project structure
   - **Extend Components**: Design to leverage and extend existing utilities, services, components
   - Use Mermaid diagrams for visual representations
   - Define clear interfaces that integrate with existing systems
   - Specify data models that follow established patterns
   - Plan error handling consistent with current approach
   - Outline testing approach using existing test utilities

5. **Approval Process**
   - Present the complete design document
   - **Highlight code reuse**: Clearly show what existing code will be leveraged
   - **Show steering document alignment**: Note how design follows tech.md and structure.md
   - Ask: "Does the design look good? If so, we can move on to the implementation plan."
   - Incorporate feedback and revisions
   - Continue until explicit approval

## Design Structure

```markdown
# Design Document

## Overview

[High-level description]

## Code Reuse Analysis

[What existing code will be leveraged, extended, or integrated]

## Architecture

[System architecture building on existing patterns]

## Components and Interfaces

[Detailed component specifications with reuse opportunities]

## Data Models

[Data structures following established patterns]

## Error Handling

[Error scenarios consistent with current approach]

## Testing Strategy

[Testing approach using existing utilities and patterns]
```

## Next Phase

After approval, proceed to `/spec-tasks`.
