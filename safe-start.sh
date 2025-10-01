#!/usr/bin/env bash
set -euo pipefail

# Colors
YELLOW='\033[1;33m'; GREEN='\033[1;32m'; RED='\033[1;31m'; NC='\033[0m'

# Ensure we're in a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo -e "${RED}Not a git repository. cd into your project first.${NC}"
  exit 1
fi

# Remember current branch
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD || echo '')"

echo -e "${YELLOW}Switching to main...${NC}"
git checkout main

# Stage & commit (only if there are changes)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo -e "${YELLOW}Committing local changes on main...${NC}"
  git add .
  git commit -m "Save progress before new feature"
else
  echo -e "${GREEN}No local changes to commit on main.${NC}"
fi

echo -e "${YELLOW}Pushing main to origin...${NC}"
git push origin main

# Create dated backup branch
STAMP="$(date +%Y%m%d)"
BACKUP_BRANCH="backup-${STAMP}"

# If already exists locally, move to new unique suffix
if git show-ref --quiet "refs/heads/${BACKUP_BRANCH}"; then
  SUFFIX=1
  while git show-ref --quiet "refs/heads/${BACKUP_BRANCH}-${SUFFIX}"; do
    SUFFIX=$((SUFFIX+1))
  done
  BACKUP_BRANCH="${BACKUP_BRANCH}-${SUFFIX}"
fi

echo -e "${YELLOW}Creating backup branch: ${BACKUP_BRANCH}${NC}"
git branch "${BACKUP_BRANCH}"
git push -u origin "${BACKUP_BRANCH}"

# Ask for feature branch name
read -rp "$(echo -e ${YELLOW}Enter feature branch name (e.g. feature-nearby-filter): ${NC})" FEAT
if [[ -z "${FEAT}" ]]; then
  echo -e "${RED}Feature branch name cannot be empty.${NC}"
  exit 1
fi

# Normalize simple spaces to dashes
FEAT="$(echo "${FEAT}" | tr ' ' '-')"

# If branch exists, warn & exit
if git show-ref --quiet "refs/heads/${FEAT}"; then
  echo -e "${RED}Branch '${FEAT}' already exists. Choose a different name.${NC}"
  exit 1
fi

echo -e "${YELLOW}Creating feature branch: ${FEAT}${NC}"
git checkout -b "${FEAT}"
git push -u origin "${FEAT}"

echo -e "${GREEN}All set! You're now on '${FEAT}'.${NC}"
echo -e "Backup saved as '${BACKUP_BRANCH}'. If anything breaks, you can:"
echo -e "  ${YELLOW}git checkout ${BACKUP_BRANCH}${NC}  (to view backup)"
echo -e "  ${YELLOW}git checkout main${NC} && ${YELLOW}git pull${NC}  (to get back to latest stable main)"
