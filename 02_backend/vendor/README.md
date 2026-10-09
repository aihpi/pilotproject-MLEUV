# vendor

Packages that `requirements.txt` needs but that are not on PyPI. The Dockerfile installs with
`--find-links vendor`, so a wheel (`*.whl`) or source archive (`*.tar.gz`) placed here is found
by name.

Expected here:

- `bmds-prompt-loader`
- `bmds-prompt-security`

Both come from Spark (`prompt-loader`, `prompt-security`, EUPL-1.2). Without them the backend
image does not build.
