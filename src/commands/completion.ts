import { DeployPilotError } from "../errors";

const COMMANDS = [
  "deploy", "watch", "status", "history", "logs", "cancel", "rerun",
  "rollback", "doctor", "lint", "explain", "list", "new", "secrets",
  "init", "completion",
];

const BASH = `# deploypilot bash completion
# Install:  deploypilot completion bash >> ~/.bashrc
_deploypilot_completions() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( \$(compgen -W "${COMMANDS.join(" ")}" -- "\$cur") )
    return
  fi

  case "\$prev" in
    --workflow|-w)
      COMPREPLY=( \$(compgen -W "\$(ls .github/workflows 2>/dev/null)" -- "\$cur") )
      return ;;
    --strategy)
      COMPREPLY=( \$(compgen -W "tag branch dispatch release" -- "\$cur") )
      return ;;
    --bump)
      COMPREPLY=( \$(compgen -W "major minor patch prerelease auto" -- "\$cur") )
      return ;;
  esac

  COMPREPLY=( \$(compgen -W "--all --staged --file --no-commit --message --tag --ref --bump --dry-run --yes --watch --json --force --verbose" -- "\$cur") )
}
complete -F _deploypilot_completions deploypilot dpp
`;

const ZSH = `#compdef deploypilot dpp
# Install:  deploypilot completion zsh > "\${fpath[1]}/_deploypilot"
_deploypilot() {
  local -a commands
  commands=(
    'deploy:Deploy the current repository'
    'watch:Watch a workflow run'
    'status:Show what is deployed and what is in flight'
    'history:List past deployments'
    'logs:Show logs for a run'
    'cancel:Cancel the in-flight run'
    'rerun:Re-run a workflow run'
    'rollback:Re-deploy a previous successful run'
    'doctor:Audit workflows for problems'
    'lint:Validate workflow YAML'
    'explain:Describe when and how a workflow runs'
    'list:List discovered workflows'
    'new:Scaffold a workflow from a template'
    'secrets:Compare referenced secrets against configured ones'
    'init:Create a deploypilot config'
    'completion:Print a shell completion script'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  case \${words[2]} in
    deploy)
      _arguments \\
        '--workflow[Workflow file]:workflow:_files -W .github/workflows' \\
        '--strategy[Trigger strategy]:strategy:(tag branch dispatch release)' \\
        '--bump[Version bump]:bump:(major minor patch prerelease auto)' \\
        '--file[Commit only this file]:file:_files' \\
        '--all[Commit every change]' \\
        '--staged[Commit only what is staged]' \\
        '--no-commit[Deploy existing commits]' \\
        '--dry-run[Show what would happen]' \\
        '--watch[Follow the run]' \\
        '--yes[Skip confirmations]'
      ;;
  esac
}
_deploypilot "\$@"
`;

const FISH = `# deploypilot fish completion
# Install:  deploypilot completion fish > ~/.config/fish/completions/deploypilot.fish
complete -c deploypilot -f
${COMMANDS.map((command) => `complete -c deploypilot -n __fish_use_subcommand -a ${command}`).join("\n")}
complete -c deploypilot -n '__fish_seen_subcommand_from deploy' -l all -d 'Commit every change'
complete -c deploypilot -n '__fish_seen_subcommand_from deploy' -l staged -d 'Commit only staged files'
complete -c deploypilot -n '__fish_seen_subcommand_from deploy' -l no-commit -d 'Deploy existing commits'
complete -c deploypilot -n '__fish_seen_subcommand_from deploy' -l dry-run -d 'Show what would happen'
complete -c deploypilot -n '__fish_seen_subcommand_from deploy' -l watch -d 'Follow the run'
complete -c deploypilot -n '__fish_seen_subcommand_from deploy' -l strategy -a 'tag branch dispatch release'
`;

export function completionCommand(shell: string | undefined): void {
  const scripts: Record<string, string> = { bash: BASH, zsh: ZSH, fish: FISH };
  const script = scripts[shell ?? ""];

  if (!script) {
    throw new DeployPilotError(`Unsupported shell '${shell ?? ""}'.`, {
      hint: "Usage: deploypilot completion <bash|zsh|fish>",
    });
  }

  process.stdout.write(script);
}
