#!/bin/bash
# Installed root-owned. The deploy key can only upload/deploy a 40-character SHA.
set -euo pipefail
umask 077
command=${SSH_ORIGINAL_COMMAND:-}
if [[ "$command" =~ ^upload\ ([0-9a-f]{40})$ ]]; then
    sha=${BASH_REMATCH[1]}
    incoming=/var/lib/chocoleaf-deploy/incoming
    temporary=$(mktemp "$incoming/.upload-XXXXXXXX")
    trap 'rm -f -- "$temporary"' EXIT
    # A bounded stream; a larger/incomplete archive will fail validation.
    head -c 268435457 > "$temporary"
    if [[ $(stat -c %s "$temporary") -gt 268435456 ]]; then
        printf 'Upload exceeds 256 MiB.\n' >&2
        exit 1
    fi
    mv -f -- "$temporary" "$incoming/$sha.tar.gz"
    printf 'Uploaded %s\n' "$sha"
elif [[ "$command" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
    exec sudo -n /usr/local/sbin/chocoleaf-deploy "${BASH_REMATCH[1]}"
elif [[ "$command" =~ ^check\ ([0-9a-f]{40})$ ]]; then
    exec sudo -n /usr/local/sbin/chocoleaf-deploy --check "${BASH_REMATCH[1]}"
elif [[ "$command" == status ]]; then
    printf 'ChocoLeaf restricted deployment access ready.\n'
else
    printf 'Only upload COMMIT, check COMMIT, deploy COMMIT and status are permitted.\n' >&2
    exit 1
fi
