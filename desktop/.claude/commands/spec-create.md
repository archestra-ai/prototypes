# Spec Create Command

Create a new feature specification following the spec-driven workflow.

## Usage

```
/spec-create <feature-name> [description]
```

## Instructions

You are helping create a new feature specification. Follow these steps:

**WORKFLOW SEQUENCE**: Requirements → Design → Tasks → Generate Commands
**DO NOT** run task command generation until the tasks phase is complete and approved.

1. **Create Directory Structure**
   - Create `.claude/specs/{feature-name}/` directory
   - Initialize empty requirements.md, design.md, and tasks.md files

2. **Check for Steering Documents**
   - Look for .claude/product.md (product vision and goals)
   - Look for .claude/tech.md (technical standards and patterns)
   - Look for .claude/structure.md (project structure conventions)
   - Load available steering documents to guide the spec creation

3. **Parse Feature Description**
   - Take the feature name and optional description
   - Begin the requirements gathering phase immediately
   - Do not ask sequential questions - generate initial requirements

4. **Analyze Existing Codebase** (BEFORE writing requirements)
   - **Search for similar features**: Look for existing authentication, data handling, UI patterns, etc.
   - **Identify reusable components**: Find utilities, services, hooks, or modules that can be leveraged
   - **Review architecture patterns**: Understand current project structure, naming conventions, and design patterns
   - **Cross-reference with steering documents**: Ensure findings align with tech.md patterns and structure.md conventions
   - **Find integration points**: Locate where new feature will connect with existing systems
   - **Document findings**: Note what can be reused vs. what needs to be built from scratch

5. **Generate Initial Requirements**
   - Use the requirements template from `.claude/templates/requirements-template.md`
   - **Align with product.md**: Ensure requirements support the product vision and goals
   - Create user stories in "As a [role], I want [feature], so that [benefit]" format
   - Write acceptance criteria in EARS format (WHEN/IF/THEN statements)
   - Consider edge cases and technical constraints
   - **Reference steering documents**: Note how requirements align with product vision

6. **Request User Approval**
   - Present the requirements document
   - **Include codebase analysis summary**: Briefly note what existing code can be leveraged
   - Ask: "Do the requirements look good? If so, we can move on to the design."
   - Wait for explicit approval before proceeding

7. **Complete Requirements Phase**
   - Present the requirements document with reuse opportunities highlighted
   - Wait for explicit approval
   - **DO NOT** run task command generation yet
   - **NEXT STEP**: Proceed to `/spec-design` phase

8. **Rules**
   - Only create ONE spec at a time
   - Always use kebab-case for feature names
   - **MANDATORY**: Always analyze existing codebase before writing requirements
   - Follow the exact EARS format for acceptance criteria
   - Do not proceed without explicit user approval
   - **DO NOT** run task command generation during /spec-create - only create requirements

## Example

```
/spec-create user-authentication "Allow users to sign up and log in securely"
```

## Next Steps

After user approval, proceed to `/spec-design` phase.
