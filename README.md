# 🚀 DeployPilot

![npm](https://img.shields.io/npm/v/DeployPilot)
![License](https://img.shields.io/npm/l/DeployPilot)
![Node](https://img.shields.io/badge/node-%3E%3D20-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

> Deploy GitHub Actions workflows with a single command.

DeployPilot is a lightweight CLI that automates Git-based deployments for projects using GitHub Actions.

Instead of manually staging files, committing, creating tags, and pushing changes, DeployPilot detects your deployment workflow and performs the required Git operations automatically.

---

## ✨ Features

- 🔍 Automatically detects Git repositories
- 📦 Discovers GitHub Actions workflows
- 🧠 Detects deployment strategy automatically
- 🏷️ Automatic tag generation
- 🌿 Branch-based deployments
- 🚀 Tag-based deployments
- 💬 Interactive prompts
- ⏳ Beautiful terminal spinners
- ⚡ Zero configuration
- 🛡️ TypeScript powered

---

## Supported Workflows

### Branch Deployment

```yaml
on:
  push:
    branches:
      - main
```

DeployPilot will:

- Stage files
- Commit changes
- Push the branch

---

### Tag Deployment

```yaml
on:
  push:
    tags:
      - "prod-v*"
```

DeployPilot will:

- Stage files
- Commit changes
- Generate deployment tag
- Push branch
- Push tag

If there are no uncommitted changes, DeployPilot can create and push a deployment tag from the latest commit.

---

### Manual Workflow

```yaml
on:
  workflow_dispatch:
```

Manual workflows are detected and supported.

---

# Installation

## npm

```bash
npm install -g deploymate
```

or

```bash
npx deploymate deploy
```

---

# Usage

```bash
deploymate deploy
```

or

```bash
dpm deploy
```

---

# Example

```text
🚀 DeployMate

✔ Git repository detected
ℹ Current branch: main

◇ Select a workflow
│ Deploy Production

✔ Selected workflow: Deploy Production
ℹ Strategy: tag

◇ Commit message
│ Release payment fixes

◐ Staging files...
✔ Files staged

◐ Creating commit...
✔ Commit created

◐ Creating tag...
✔ Tag created

◐ Pushing branch...
✔ Branch pushed

◐ Pushing tag...
✔ Tag pushed

✔ Deployment started successfully.
```

---

# Requirements

- Node.js 20+
- Git
- GitHub Actions
- A Git repository

---

# Supported Deployment Strategies

| Strategy          | Status |
| ----------------- | ------ |
| Branch Push       | ✅     |
| Tag Push          | ✅     |
| Workflow Dispatch | ✅     |
| Release           | 🚧     |

---

# Roadmap

### v0.2

- GitHub Actions live monitoring
- Workflow input parser
- Branch auto-selection
- Release deployments
- Rollback support
- Deployment history
- Config file

---

# Development

Clone the repository

```bash
git clone https://github.com/himanshu-soni57/deploymate.git
```

Install dependencies

```bash
bun install
```

Run locally

```bash
bun run dev
```

Build

```bash
bun run build
```

---

# Contributing

Pull requests are welcome.

If you'd like to propose a feature or report a bug, please open an issue first to discuss the changes.

---

# License

MIT License

Copyright (c) 2026 Himanshu Soni

This project is licensed under the MIT License.
