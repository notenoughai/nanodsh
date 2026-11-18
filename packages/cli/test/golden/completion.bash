_nanodsh_complete() {
  local cur prev subcommands
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  subcommands="distro instance profile plugin completion"

  case "${prev}" in
    --profile) COMPREPLY=( $(compgen -W "$(nanodsh --list-profiles 2>/dev/null)" -- "${cur}") ); return 0 ;;
    --instance) COMPREPLY=( $(compgen -W "$(nanodsh --list-instances 2>/dev/null)" -- "${cur}") ); return 0 ;;
    --home) COMPREPLY=( $(compgen -d -- "${cur}") ); return 0 ;;
    --patch) COMPREPLY=( $(compgen -f -- "${cur}") ); return 0 ;;
  esac

  if [ "${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${subcommands} --profile --instance --home --patch --dump-config --dump-default-config --dump-config-schema --version --help $(nanodsh --list-profiles 2>/dev/null)" -- "${cur}") )
    return 0
  fi

  case "${COMP_WORDS[1]}" in
    distro) COMPREPLY=( $(compgen -W "add show switch" -- "${cur}") ) ;;
    instance) COMPREPLY=( $(compgen -W "list add set show default remove rename" -- "${cur}") ) ;;
    profile) COMPREPLY=( $(compgen -W "list create remove" -- "${cur}") ) ;;
    plugin) COMPREPLY=( $(compgen -W "add remove" -- "${cur}") ) ;;
    completion) COMPREPLY=( $(compgen -W "bash zsh fish pwsh" -- "${cur}") ) ;;
    *) COMPREPLY=( $(compgen -W "--profile --instance --home --patch --dump-config --dump-default-config --dump-config-schema --version --help" -- "${cur}") ) ;;
  esac
}

complete -F _nanodsh_complete nanodsh
