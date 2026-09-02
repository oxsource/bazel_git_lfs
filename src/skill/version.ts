export interface VersionSkillOptions {
  repo: string;
}

export const RELEASE_WORKFLOW_FILE = 'release.yml';

const GH_REF_NAME = '${{ github.ref_name }}';

export function renderVersionWorkflow(opts: VersionSkillOptions): string {
  return `name: version

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    name: source tarball
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - name: Build source tarball
        run: |
          git archive --format=tar.gz \\
            --prefix="${opts.repo}-${GH_REF_NAME}/" \\
            -o "${opts.repo}-${GH_REF_NAME}.tar.gz" HEAD
      - name: Upload to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: "${opts.repo}-${GH_REF_NAME}.tar.gz"
`;
}
