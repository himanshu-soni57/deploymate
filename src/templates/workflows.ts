export interface WorkflowTemplate {
  id: string;
  label: string;
  hint: string;
  filename: string;
  content: string;
}

const BUN_PUBLISH = `name: Publish

on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

concurrency:
  group: publish-\${{ github.ref }}
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun test
      - run: bun run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`;

const NODE_CI = `name: CI

on:
  push:
    branches:
      - main
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test
`;

const DOCKER_PUBLISH = `name: Docker

on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:

permissions:
  contents: read
  packages: write

concurrency:
  group: docker-\${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/\${{ github.repository }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
`;

const DEPLOY_ENVIRONMENT = `name: Deploy Production

on:
  push:
    tags:
      - "prod-v*"
  workflow_dispatch:
    inputs:
      ref:
        description: Git ref to deploy
        required: false
        default: main
        type: string
      skip_migrations:
        description: Skip database migrations
        required: false
        default: false
        type: boolean

permissions:
  contents: read
  deployments: write

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment:
      name: production
      url: https://example.com
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        run: echo "Deploying \${{ github.ref_name }}"
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
`;

const PAGES = `name: Deploy Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;

const RELEASE = `name: Release

on:
  release:
    types: [published]
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: release-\${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: Attach artifacts
        run: echo "Uploading release assets for \${{ github.event.release.tag_name }}"
`;

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "deploy",
    label: "Tag-triggered production deploy",
    hint: "prod-v* tag, environment gate, manual dispatch fallback",
    filename: "deploy-prod.yml",
    content: DEPLOY_ENVIRONMENT,
  },
  {
    id: "bun-publish",
    label: "Publish to npm on a version tag",
    hint: "v*.*.* tag, Bun, provenance",
    filename: "publish.yml",
    content: BUN_PUBLISH,
  },
  {
    id: "node-ci",
    label: "Node CI on push and pull request",
    hint: "matrix, cancel-in-progress",
    filename: "ci.yml",
    content: NODE_CI,
  },
  {
    id: "docker",
    label: "Build and push a Docker image to GHCR",
    hint: "buildx, layer cache, tag-triggered",
    filename: "docker.yml",
    content: DOCKER_PUBLISH,
  },
  {
    id: "pages",
    label: "Deploy a static site to GitHub Pages",
    hint: "build + deploy jobs",
    filename: "pages.yml",
    content: PAGES,
  },
  {
    id: "release",
    label: "Run on GitHub Release published",
    hint: "on: release",
    filename: "release.yml",
    content: RELEASE,
  },
];

export function findTemplate(id: string): WorkflowTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
