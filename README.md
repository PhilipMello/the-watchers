# The Watchers — Genesis v0.0.0

Clean Genesis release, based on the tested and approved v0.4.5 hotfix 1.

The collection starts empty: no entries, relationships, sources, notes, badges, categories, uploaded media, or custom CSS. Standard Person, Company, Country, and Group templates and reusable field definitions remain available. All 16 bundled plugins are enabled by default for a new browser session. Product text uses en-US.

Application, core, bundled plugin, and theme versions start at **0.0.0**. Data-format and extension-API versions are retained; this release reset does not reset record IDs, storage formats, or Git history.

## Run locally

The ZIP includes a prebuilt `dist/`. From the extracted folder, with Python 3 installed:

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Open http://localhost:8080/. Press Ctrl+C to stop. Use localhost or HTTPS, not file://. Existing browser drafts/vaults are not erased; use a separate local path or review recovery notices before restoring older work.

From a Git clone, build first with Node.js 22 or newer:

```bash
npm run validate
npm test
npm run build
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

No dependency installation is required. The Docs menu explains everyday use, custom fields, categories, filters, images, the vault, and GitHub submission.

## Initial installation through the UI (repository with LICENSE only)

This clean package includes a complete source bundle for the GitHub plugin.
The release remains Genesis v0.0.0; this package adds the initial-installation flow.

1. Start the local server shown above and open http://localhost:8080/.
2. Open **Plugins → GitHub → Settings**. Enter your repository owner,
   repository name `the-watchers`, and destination branch `main`. Save.
3. Open **Submit changes to GitHub** and choose **Publication mode → Install clean Genesis**.
4. Connect with a fine-grained token restricted to that repository. Enable
   **Contents**, **Pull requests**, and **Workflows** with **Read and write** access.
   Workflows is needed because the installation includes `.github/workflows/pages.yml`.
5. Review the source files, author, email, title, and description. The suggested
   new branch is `genesis`; the destination stays `main`.
6. Click **Create pull request**, then **Confirm submission**. Keep the page open
   while files upload. Use the result link if the new tab is blocked.
7. Review and merge **genesis → main** on GitHub. Configure Pages as described below.

The installer preserves the existing LICENSE and unrelated files using the base
Git tree. Conflicting files block installation. It never pushes directly to main.
It sends the clean build source, not browser drafts or local plugin settings.
Synthetic test fixtures are included for CI but are not collection entries.
It excludes dist, archives, optional documentation, media, and vault backups.
A populated source build cannot be used for this clean installation mode.

For subsequent data edits, use **Collection changes** from the deployed version.
The token remains in page memory only. An unfinished committed submission can be
resumed by reconnecting; its review information is saved without the token.
This installer does not enable Pages or merge the PR automatically.

GitHub permission reference: https://docs.github.com/en/rest/git/refs#create-a-reference

## Publish to GitHub Pages

Use Git commands to upload the project: `.gitignore` is applied by Git, not by manually uploading all files through a browser.

For a new empty repository, run from the extracted package:

```bash
git init -b main
git add .
git status --short
git commit -m "Genesis v0.0.0"
git remote add origin https://github.com/YOUR-OWNER/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the owner and repository placeholders before running the remote command. If the repository already contains LICENSE or other commits, clone it first and copy the package into that clone, including `.github/` and `.gitignore`, while preserving `.git/` and LICENSE. Review and commit normally; do not force-push over existing history.

In repository **Settings → Pages**, select **GitHub Actions** as the source. The included workflow validates the collection, runs the tests, builds the site, and publishes `dist/` from `main`. Pull requests run validation/build without deploying. Wait for the workflow to succeed, then open the Pages URL and hard-refresh once.

The workflow retains the action versions and Node.js version from the approved release. Enable Actions for the repository if they are disabled. Do not commit tokens or encrypted vault backups.

## What Git tracks

| Tracked | Purpose |
| --- | --- |
| `.github/`, `.gitignore`, `package.json`, `README.md` | Publication workflow, tracking rules, commands, setup |
| `assets/`, `core/`, `plugins/`, `themes/` | Application runtime and themes |
| `config/`, `data/`, `lang/`, `objects/`, `media/` when present | Configuration and collection source |
| `scripts/`, `tests/` | CLI tools and CI verification |
| Existing `LICENSE`, `LICENSE.*`, `COPYING` | Preserve the repository's chosen license |

Tests contain synthetic compatibility fixtures required by CI. The initial-installation source bundle carries these test files, but the application never loads them as collection data. The live source collection and public object index are empty of records. `objects/.gitkeep` retains the empty source folder; it is not a data record and is not copied into the public object index.

## What stays only in the ZIP

The root allowlist in `.gitignore` excludes `dist/`, `docs/`, `schemas/`, `examples/`, `archive/`, root preview files, the changelog, and supplemental publication notes. GitHub Actions rebuilds `dist/`; the repository does not need a committed copy. New root-level files or folders are ignored unless explicitly allowed.

If an existing repository already tracks an excluded file, `.gitignore` does not remove it from tracking. Inspect these paths:

```bash
git ls-files -ci --exclude-standard
```

After reviewing the output, use `git rm --cached -- PATH` for a file or `git rm -r --cached -- DIRECTORY` for a directory you intend to stop tracking. This retains the local files. Review `git status` before committing. The ZIP does not automatically modify an existing repository's index.

## Add and publish entries

Create entries in the UI. New entries default to Private and require an unlocked vault; choose Public for information you intend to publish. Saving changes stores them on your device. Use Collection changes in the GitHub plugin after the repository contains this source and its current deployment. Use Install clean Genesis for the first installation. Merge and deployment remain separate steps.

The module-cache fix from the approved hotfix is retained: every build uses revision URLs for scripts, transitive imports, plugin entry points, and theme styles. If a compatibility error appears, deploy the complete build and hard-refresh without deleting browser storage.

## Import an existing public collection (optional)

Genesis is empty by default. To intentionally bring back your own collection, export its public package and create a separate source project:

```bash
npm run import -- /path/to/public-package.json ../the-watchers-with-data
```

The importer does not overwrite the current project. Build and review the new project before publishing. Private data stays in encrypted vault backups and is excluded from public exports.
