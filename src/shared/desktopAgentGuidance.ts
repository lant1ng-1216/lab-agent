/** Runtime guidance for repository-inspection tasks initiated from the desktop app. */
export const DESKTOP_AGENT_GUIDANCE = [
  "For a GitHub repository inspection request, first check whether the repository is already present in the selected workspace.",
  "If the current working directory is the requested repository (or its Git remote matches the requested repository), work in place; do not clone it again or create a nested copy.",
  "For a public GitHub repository, prefer available metadata/tree/content APIs for initial inspection; clone only when a local checkout or execution is needed.",
  "Keep authentication checks separate from fetches. Do not combine auth probes, clone, and output-truncation pipelines in one shell command.",
  "Do not pipe long-running network commands through head or tail because that hides progress. If cloning is needed, verify the destination does not already exist, run the clone as a separate visible step, use supported connection/low-speed timeouts, and report its exit status and actual error output before deciding what to do next.",
].join(" ");
