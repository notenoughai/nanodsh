complete -c nanodsh -f
complete -c nanodsh -n '__fish_use_subcommand' -a 'distro instance profile plugin completion'
complete -c nanodsh -n '__fish_use_subcommand' -a '(nanodsh --list-profiles 2>/dev/null)'
complete -c nanodsh -l profile -x -a '(nanodsh --list-profiles 2>/dev/null)'
complete -c nanodsh -l instance -x -a '(nanodsh --list-instances 2>/dev/null)'
complete -c nanodsh -l home -r -d "harness home"
complete -c nanodsh -l patch -r -F -d "overlay patch file"
complete -c nanodsh -l dump-config -d "print the composed tree"
complete -c nanodsh -l dump-default-config -d "print the bundle layers alone"
complete -c nanodsh -l dump-config-schema -d "print the config schema"
complete -c nanodsh -s V -l version -d "print the version"
complete -c nanodsh -l help -d "print help"
complete -c nanodsh -n '__fish_seen_subcommand_from distro' -a 'add show switch'
complete -c nanodsh -n '__fish_seen_subcommand_from instance' -a 'list add set show default remove rename'
complete -c nanodsh -n '__fish_seen_subcommand_from profile' -a 'list create remove'
complete -c nanodsh -n '__fish_seen_subcommand_from plugin' -a 'add remove'
complete -c nanodsh -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish pwsh'
