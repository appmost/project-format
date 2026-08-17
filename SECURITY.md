# Security

Treat every `.appmostapp` package as untrusted input. Readers should enforce
package boundaries, reject unsafe paths, validate referenced files, apply
reasonable resource limits, and never execute project content as code.

Please report security issues privately to `hello@appmost.app`. Include the
affected format version, a minimal reproduction when possible, and the impact
you observed. Do not open a public issue for an undisclosed vulnerability.
