export const SHELLS = ['bash', 'zsh', 'fish', 'pwsh'];

const SUBCOMMANDS = {
  distro: ['add', 'show', 'switch'],
  instance: ['list', 'add', 'set', 'show', 'default', 'remove', 'rename'],
  profile: ['list', 'create', 'remove'],
  plugin: ['add', 'remove'],
  completion: ['bash', 'zsh', 'fish', 'pwsh'],
};

const FLAGS = ['--profile', '--instance', '--home', '--patch', '--dump-config', '--dump-default-config', '--dump-config-schema', '--version', '--help'];

function bash() {
  return `_nanodsh_complete() {
  local cur prev subcommands
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  subcommands="distro instance profile plugin completion"

  case "\${prev}" in
    --profile) COMPREPLY=( $(compgen -W "$(nanodsh --list-profiles 2>/dev/null)" -- "\${cur}") ); return 0 ;;
    --instance) COMPREPLY=( $(compgen -W "$(nanodsh --list-instances 2>/dev/null)" -- "\${cur}") ); return 0 ;;
    --home) COMPREPLY=( $(compgen -d -- "\${cur}") ); return 0 ;;
    --patch) COMPREPLY=( $(compgen -f -- "\${cur}") ); return 0 ;;
  esac

  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${subcommands} ${FLAGS.join(' ')} $(nanodsh --list-profiles 2>/dev/null)" -- "\${cur}") )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    distro) COMPREPLY=( $(compgen -W "${SUBCOMMANDS.distro.join(' ')}" -- "\${cur}") ) ;;
    instance) COMPREPLY=( $(compgen -W "${SUBCOMMANDS.instance.join(' ')}" -- "\${cur}") ) ;;
    profile) COMPREPLY=( $(compgen -W "${SUBCOMMANDS.profile.join(' ')}" -- "\${cur}") ) ;;
    plugin) COMPREPLY=( $(compgen -W "${SUBCOMMANDS.plugin.join(' ')}" -- "\${cur}") ) ;;
    completion) COMPREPLY=( $(compgen -W "${SUBCOMMANDS.completion.join(' ')}" -- "\${cur}") ) ;;
    *) COMPREPLY=( $(compgen -W "${FLAGS.join(' ')}" -- "\${cur}") ) ;;
  esac
}

complete -F _nanodsh_complete nanodsh
`;
}

function zsh() {
  return `#compdef nanodsh

_nanodsh() {
  local -a subcommands profiles instances
  subcommands=(distro instance profile plugin completion)
  profiles=(\${(f)"$(nanodsh --list-profiles 2>/dev/null)"})
  instances=(\${(f)"$(nanodsh --list-instances 2>/dev/null)"})

  _arguments -C \\
    '--profile[profile to boot]:profile:(\${profiles})' \\
    '--instance[registered instance]:instance:(\${instances})' \\
    '--home[harness home]:directory:_files -/' \\
    '--patch[overlay patch file]:file:_files' \\
    '--dump-config[print the composed tree]' \\
    '--dump-default-config[print the bundle layers alone]' \\
    '--dump-config-schema[print the config schema]' \\
    '(-V --version)'{-V,--version}'[print the version]' \\
    '1:command:->command' \\
    '*::argument:->args'

  case $state in
    command) _describe 'command' subcommands; compadd -a profiles ;;
    args)
      case $words[1] in
        distro) _values 'distro command' ${SUBCOMMANDS.distro.join(' ')} ;;
        instance) _values 'instance command' ${SUBCOMMANDS.instance.join(' ')} ;;
        profile) _values 'profile command' ${SUBCOMMANDS.profile.join(' ')} ;;
        plugin) _values 'plugin command' ${SUBCOMMANDS.plugin.join(' ')} ;;
        completion) _values 'shell' ${SUBCOMMANDS.completion.join(' ')} ;;
      esac ;;
  esac
}

_nanodsh "$@"
`;
}

function fish() {
  const lines = [
    'complete -c nanodsh -f',
    `complete -c nanodsh -n '__fish_use_subcommand' -a '${Object.keys(SUBCOMMANDS).join(' ')}'`,
    "complete -c nanodsh -n '__fish_use_subcommand' -a '(nanodsh --list-profiles 2>/dev/null)'",
    "complete -c nanodsh -l profile -x -a '(nanodsh --list-profiles 2>/dev/null)'",
    "complete -c nanodsh -l instance -x -a '(nanodsh --list-instances 2>/dev/null)'",
    'complete -c nanodsh -l home -r -d "harness home"',
    'complete -c nanodsh -l patch -r -F -d "overlay patch file"',
    'complete -c nanodsh -l dump-config -d "print the composed tree"',
    'complete -c nanodsh -l dump-default-config -d "print the bundle layers alone"',
    'complete -c nanodsh -l dump-config-schema -d "print the config schema"',
    'complete -c nanodsh -s V -l version -d "print the version"',
    'complete -c nanodsh -l help -d "print help"',
  ];
  for (const [command, values] of Object.entries(SUBCOMMANDS)) {
    lines.push(`complete -c nanodsh -n '__fish_seen_subcommand_from ${command}' -a '${values.join(' ')}'`);
  }
  return `${lines.join('\n')}\n`;
}

function pwsh() {
  return `Register-ArgumentCompleter -Native -CommandName nanodsh -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $subcommands = @(${Object.keys(SUBCOMMANDS).map((name) => `'${name}'`).join(', ')})
    $globalFlags = @(${FLAGS.map((flag) => `'${flag}'`).join(', ')})
    $profiles = @(& nanodsh --list-profiles 2>$null)
    $instances = @(& nanodsh --list-instances 2>$null)
    $tokens = @($commandAst.CommandElements | ForEach-Object { $_.Extent.Text })
    $previous = if ($tokens.Count -gt 1) { $tokens[-1] } else { '' }
    $candidates = switch ($previous) {
        '--profile' { $profiles }
        '--instance' { $instances }
        default { $subcommands + $globalFlags + $profiles + $instances }
    }
    $candidates | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
`;
}

export function renderCompletion(shell) {
  if (shell === 'bash') return bash();
  if (shell === 'zsh') return zsh();
  if (shell === 'fish') return fish();
  if (shell === 'pwsh') return pwsh();
  throw new Error(`nanodsh: unknown shell ${JSON.stringify(shell)}; expected one of ${SHELLS.join(', ')}`);
}
