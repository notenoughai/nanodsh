#compdef nanodsh

_nanodsh() {
  local -a subcommands profiles instances
  subcommands=(distro instance profile plugin completion)
  profiles=(${(f)"$(nanodsh --list-profiles 2>/dev/null)"})
  instances=(${(f)"$(nanodsh --list-instances 2>/dev/null)"})

  _arguments -C \
    '--profile[profile to boot]:profile:(${profiles})' \
    '--instance[registered instance]:instance:(${instances})' \
    '--home[harness home]:directory:_files -/' \
    '--patch[overlay patch file]:file:_files' \
    '--dump-config[print the composed tree]' \
    '--dump-default-config[print the bundle layers alone]' \
    '--dump-config-schema[print the config schema]' \
    '(-V --version)'{-V,--version}'[print the version]' \
    '1:command:->command' \
    '*::argument:->args'

  case $state in
    command) _describe 'command' subcommands; compadd -a profiles ;;
    args)
      case $words[1] in
        distro) _values 'distro command' add show switch ;;
        instance) _values 'instance command' list add set show default remove rename ;;
        profile) _values 'profile command' list create remove ;;
        plugin) _values 'plugin command' add remove ;;
        completion) _values 'shell' bash zsh fish pwsh ;;
      esac ;;
  esac
}

_nanodsh "$@"
