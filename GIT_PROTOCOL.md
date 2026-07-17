# GIT_PROTOCOL.md

## Safe Git Process for Kids Education Project

### 🔄 **Pre-Development Commit Protocol**

#### 1. Always Commit Before Debugging
```bash
# Check current status
git status

# Stage all changes
git add .

# Create backup commit with descriptive message
git commit -m "save: current state before debugging [feature/issue]"

# Verify commit was created
git log --oneline -1
```

#### 2. Feature Development Workflow
```bash
# Create feature branch
git checkout -b feature/character-dashboard-enhancement

# Make incremental commits
git add src/frontend/components/CharacterDashboard.tsx
git commit -m "feat: add stat increase animation to CharacterDashboard"

git add src/frontend/components/StatBar.tsx
git commit -m "feat: implement hover effects for StatBar component"
```

### 📝 **Conventional Commit Messages**

#### 1. Commit Type Prefixes
- `feat:` - New feature implementation
- `fix:` - Bug fix or error correction
- `docs:` - Documentation updates
- `style:` - Code formatting changes (no logic changes)
- `refactor:` - Code restructuring without changing functionality
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks, dependencies, build process
- `save:` - Backup commit before debugging/major changes

#### 2. Message Format
```bash
# Pattern: type(scope): description
feat(dashboard): add Japanese localization for character stats
fix(csv): resolve file locking issue during concurrent updates
docs(readme): update setup instructions for development environment
refactor(components): simplify StatBar component structure
test(character): add unit tests for stat progression logic
```

#### 3. Detailed Commit Examples
```bash
# Feature commits
git commit -m "feat(dashboard): implement experience bar animation with smooth transitions"
git commit -m "feat(items): add item unlock notifications with Japanese messages"
git commit -m "feat(csv): add validation for character progression data structure"

# Bug fix commits
git commit -m "fix(dashboard): resolve stat bar scaling issue on mobile devices"
git commit -m "fix(csv): handle missing file gracefully with default data creation"
git commit -m "fix(animation): prevent stat button spam clicking exploitation"

# Documentation commits
git commit -m "docs(api): update MODULE_INTERFACE.md with new CSV operations"
git commit -m "docs(coding): add TypeScript examples to CODING_RULES.md"
git commit -m "docs(setup): include Node.js version requirements in README"
```

### 🛡️ **Safety Protocols**

#### 1. Before Major Changes
```bash
# Create safety branch
git checkout -b backup/$(date +%Y%m%d-%H%M%S)
git checkout main

# Or create tagged backup
git tag backup-$(date +%Y%m%d-%H%M%S)
git push origin backup-$(date +%Y%m%d-%H%M%S)
```

#### 2. Debugging Workflow
```bash
# Step 1: Save current state
git add .
git commit -m "save: pre-debug state for character stat calculation issue"

# Step 2: Make debugging changes
# ... debugging work ...

# Step 3: Commit fix
git add .
git commit -m "fix(character): resolve stat calculation overflow bug"

# Step 4: Clean up if needed
git rebase -i HEAD~2  # Only if you want to squash commits
```

#### 3. CSV File Safety
```bash
# Before modifying CSV files
git add data/
git commit -m "save: CSV data before structure modifications"

# After CSV changes
git add data/
git commit -m "feat(data): add Japanese names and descriptions to character_progression.csv"
```

### 🌿 **Branch Management**

#### 1. Branch Naming Convention
```bash
# Feature branches
feature/dashboard-localization
feature/item-progression-system
feature/experience-animations

# Bug fix branches
fix/csv-file-locking
fix/mobile-responsive-issues
fix/stat-validation-errors

# Documentation branches
docs/api-interface-updates
docs/setup-guide-improvements
```

#### 2. Branch Lifecycle
```bash
# Create and switch to feature branch
git checkout -b feature/new-feature

# Regular commits during development
git add .
git commit -m "feat: implement feature component A"
git add .
git commit -m "feat: add feature component B"

# Push feature branch
git push -u origin feature/new-feature

# Merge back to main (after review)
git checkout main
git merge feature/new-feature
git branch -d feature/new-feature
```

### 🚨 **Emergency Procedures**

#### 1. Revert Bad Commits
```bash
# Revert last commit
git revert HEAD

# Revert specific commit
git revert <commit-hash>

# Reset to previous state (use with caution)
git reset --hard HEAD~1
```

#### 2. Recover Lost Work
```bash
# Find lost commits
git reflog

# Recover specific commit
git checkout <commit-hash>
git checkout -b recovery-branch
```

#### 3. Fix Merge Conflicts
```bash
# When conflicts occur
git status  # See conflicted files

# Edit files to resolve conflicts
# Remove conflict markers: <<<<<<<, =======, >>>>>>>

git add <resolved-files>
git commit -m "fix: resolve merge conflicts in character data handling"
```

### 📊 **File-Specific Protocols**

#### 1. CSV Data Files
```bash
# Always backup before CSV changes
git add data/
git commit -m "save: backup CSV data before modifications"

# Validate CSV after changes
npm run validate:csv  # Custom validation script
git add data/
git commit -m "feat(data): update character progression with new stat validation"
```

#### 2. React Components
```bash
# Commit component structure first
git add src/frontend/components/NewComponent.tsx
git commit -m "feat(component): add NewComponent basic structure"

# Then commit styling
git add src/frontend/components/NewComponent.css
git commit -m "style(component): add responsive styling for NewComponent"

# Finally commit integration
git add src/frontend/screens/Dashboard.tsx
git commit -m "feat(integration): integrate NewComponent into Dashboard"
```

#### 3. Documentation Updates
```bash
# Update documentation incrementally
git add README.md
git commit -m "docs(readme): update installation instructions"

git add MODULE_INTERFACE.md
git commit -m "docs(api): add new CSV operation interfaces"

git add CODING_RULES.md
git commit -m "docs(standards): add React component guidelines"
```

### 🔍 **Commit Verification**

#### 1. Pre-Commit Checks
```bash
# Run tests before committing
npm test
npm run lint
npm run type-check

# Commit only if all checks pass
git add .
git commit -m "feat(dashboard): add stat progression with full test coverage"
```

#### 2. Commit Quality Review
```bash
# Review changes before committing
git diff --cached

# Check commit message
git log --oneline -1

# Amend commit if needed
git commit --amend -m "feat(dashboard): corrected commit message"
```

### 📈 **Progress Tracking**

#### 1. Feature Progress
```bash
# Tag major milestones
git tag v1.0.0-dashboard-complete
git tag v1.1.0-japanese-localization
git tag v1.2.0-item-system

# Push tags
git push origin --tags
```

#### 2. Development History
```bash
# View development progress
git log --oneline --graph --decorate

# Filter by feature
git log --grep="feat(dashboard)"

# View file history
git log --follow -- src/frontend/components/CharacterDashboard.tsx
```

This Git protocol ensures safe, trackable, and reversible development practices for the Kids Education project.