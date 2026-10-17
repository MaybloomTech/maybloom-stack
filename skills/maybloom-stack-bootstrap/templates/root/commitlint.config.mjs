// Conventional Commits (https://www.conventionalcommits.org), enforced by
// .github/workflows/conventional-commits.yml on every commit of a pull
// request and on its title. The title is the one that lands on main when
// the repository squash-merges, so it is held to the same rules.
export default {
  extends: ['@commitlint/config-conventional'],

  // Dependabot writes its own headers, and a grouped update appends
  // " in the <group> group across N directories", which can push an
  // ordinary bump past the 100-character header limit. The matcher requires
  // the conventional prefix, so what it exempts is already correctly
  // shaped: this waives the length, not the format.
  ignores: [(message) => /^(build|chore|ci)\(deps(-dev)?\): bump /.test(message)],
};
