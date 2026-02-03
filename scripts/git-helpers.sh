#!/bin/bash
# Git Worktree Helpers
# Source this file to use: source ./scripts/git-helpers.sh

# Create a new worktree and branch from within current git directory.
ga() {
  if [[ -z "$1" ]]; then
    echo "Usage: ga [branch name]"
    return 1
  fi

  local branch="$1"
  local base="$(basename "$PWD")"
  local path="../${base}--${branch}"

  git worktree add -b "$branch" "$path"

  # Trust mise if available
  if command -v mise &> /dev/null; then
    mise trust "$path" 2>/dev/null || true
  fi

  cd "$path"
  echo "Created worktree at $path on branch $branch"
}

# Remove worktree and branch from within active worktree directory.
gd() {
  local cwd worktree root branch

  cwd="$(pwd)"
  worktree="$(basename "$cwd")"

  # Split on first `--`
  root="${worktree%%--*}"
  branch="${worktree#*--}"

  # Protect against accidentally nuking a non-worktree directory
  if [[ "$root" == "$worktree" ]]; then
    echo "Error: Not in a worktree directory (expected format: repo--branch)"
    return 1
  fi

  echo "This will remove:"
  echo "  - Worktree: $worktree"
  echo "  - Branch: $branch"
  read -p "Continue? (y/N) " confirm

  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    cd "../$root"
    git worktree remove "$worktree" --force
    git branch -D "$branch"
    echo "Removed worktree and branch"
  else
    echo "Cancelled"
  fi
}

# List all worktrees
gw() {
  git worktree list
}

echo "Git worktree helpers loaded: ga, gd, gw"
