# Spec Tasks Command

Generate implementation task list based on approved design.

## Usage

```
/spec-tasks [feature-name]
```

## Instructions

You are working on the tasks phase of the spec workflow.

**WORKFLOW**: This is the FINAL step before command generation.
**SEQUENCE**: Create Tasks → Get Approval → Ask User → Generate Commands
**DO NOT** run task command generation until tasks are approved.

1. **Prerequisites**
   - Ensure design.md exists and is approved
   - Load both requirements.md and design.md for context
   - **Load structure.md**: Check for project structure conventions
   - Understand the complete feature scope

2. **Generate Task List** (prioritize code reuse and follow conventions)
   - Break design into atomic, executable coding tasks
   - **Follow structure.md**: Ensure tasks respect project file organization
   - **Prioritize extending/adapting existing code** over building from scratch
   - Use checkbox format with numbered hierarchy
   - Each task should reference specific requirements AND existing code to leverage
   - Focus ONLY on coding tasks (no deployment, user testing, etc.)

3. **Task Guidelines**
   - Tasks should be concrete and actionable
   - **Reference existing code to reuse**: Include specific files/components to extend or adapt
   - Include specific file names and components
   - Build incrementally (each task builds on previous)
   - Reference requirements using _Requirements: X.Y_ format
   - Use test-driven development approach leveraging existing test patterns

4. **Task Format**

   ```markdown
   - [ ] 1. Task description
     - Sub-bullet with details
     - Specific files to create/modify
     - _Leverage: existing-component.ts, utils/helpers.js_
     - _Requirements: 1.1, 2.3_
   ```

5. **Excluded Tasks**
   - User acceptance testing
   - Deployment to production
   - Performance metrics gathering
   - User training or documentation
   - Business process changes

6. **Approval Process**
   - Present the complete task list
   - Ask: "Do the tasks look good?"
   - Make revisions based on feedback
   - Continue until explicit approval

7. **Generate Task Commands** (ONLY after tasks approval)
   - **WAIT**: Do not run command generation until user explicitly approves tasks
   - **ASK USER**: "Would you like me to generate individual task commands for easier execution? (yes/no)"
   - **IF YES**: Execute `npx @pimzino/claude-code-spec-workflow@latest generate-task-commands {feature-name}`
   - **IF NO**: Continue with traditional `/spec-execute` approach
   - **PURPOSE**: Creates individual task commands in `.claude/commands/{feature-name}/`
   - **RESULT**: Each task gets its own command: `/{feature-name}-task-{task-id}`
   - **EXAMPLE**: Creates `/{feature-name}-task-1`, `/{feature-name}-task-2.1`, etc.
   - **CROSS-PLATFORM**: Works automatically on Windows, macOS, and Linux
   - **RESTART REQUIRED**: Inform user to restart Claude Code for new commands to be visible

## Task Structure

```markdown
# Implementation Plan

- [ ] 1. Setup project structure
  - Create directory structure following existing patterns
  - Define core interfaces extending existing base classes
  - _Leverage: src/types/base.ts, src/models/BaseModel.ts_
  - _Requirements: 1.1_

- [ ] 2. Implement data models
- [ ] 2.1 Create base model classes
  - Extend existing validation utilities
  - Write unit tests using existing test helpers
  - _Leverage: src/utils/validation.ts, tests/helpers/testUtils.ts_
  - _Requirements: 2.1, 2.2_
```

## Next Phase

After approval and command generation:

1. **RESTART Claude Code** for new commands to be visible
2. Then you can:
   - Use `/spec-execute` to implement tasks
   - Use individual task commands: `/{feature-name}-task-1`, `/{feature-name}-task-2`, etc.
   - Check progress with `/spec-status {feature-name}`
