// Conventional Commits (https://www.conventionalcommits.org), enforced by
// .github/workflows/conventional-commits.yml on each pull request's title.
// The title is the one commit that lands on main when the repository
// squash-merges, so it is the only one checked; a local
// `pnpm exec commitlint` still lints any message against these rules.
export default {
  extends: ['@commitlint/config-conventional'],

  // Dependabot writes its own headers, and a grouped update appends
  // " in the <group> group across N directories", which can push an
  // ordinary bump past the 100-character header limit. The matcher requires
  // the conventional prefix, so what it exempts is already correctly
  // shaped: this waives the length, not the format.
  ignores: [(message) => /^(build|chore|ci)\(deps(-dev)?\): bump /.test(message)],
};
