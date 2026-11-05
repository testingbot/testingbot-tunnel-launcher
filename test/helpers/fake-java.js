'use strict'

// A stand-in for java, so the tests can make a tunnel behave in ways the real
// one only does on a bad day. It understands what the launcher asks of java:
//   java -version                 reports FAKE_JAVA_RUNTIME (default 17)
//   java -jar tunnel.jar -h       exits 0
//   java -jar tunnel.jar --version reports FAKE_JAVA_TUNNEL (default 5.1)
//   java -jar tunnel.jar ... -f F  behaves as FAKE_JAVA says:
//     (unset)  keeps running without ever becoming ready
//     ready    touches the readyfile, reports a failed API call 2 seconds later and keeps running
// Every argument it is started with is appended to FAKE_JAVA_LOG, when set.

const fs = require('fs')
const os = require('os')
const path = require('path')

const script = [
	'#!/bin/sh',
	'[ -n "$FAKE_JAVA_LOG" ] && echo "$*" >> "$FAKE_JAVA_LOG"',
	'if [ "$1" = "-version" ]; then',
	'  echo "openjdk version \\"${FAKE_JAVA_RUNTIME:-17}.0.1\\" 2024-10-15" >&2',
	'  exit 0',
	'fi',
	'for arg in "$@"; do',
	'  [ "$arg" = "-h" ] && exit 0',
	'  [ "$arg" = "--version" ] && echo "Version: testingbot-tunnel.jar ${FAKE_JAVA_TUNNEL:-5.1}" && exit 0',
	'done',
	'READY=""',
	'while [ $# -gt 0 ]; do [ "$1" = "-f" ] && READY="$2"; shift; done',
	'trap "exit 0" INT TERM',
	'if [ "$FAKE_JAVA" = "ready" ]; then',
	'  touch "$READY"',
	'  sleep 2',
	'  echo "Failed : HTTP error code : 503" >&2',
	'fi',
	'while true; do sleep 0.1; done',
	''
].join('\n')

/**
 * Write the fake java to a directory
 * @param {String} directory
 * @param {String} [name]
 * @returns {String} its location
 */
function write (directory, name = 'java') {
	const location = path.join(directory, name)
	fs.mkdirSync(directory, { recursive: true })
	fs.writeFileSync(location, script, { mode: 0o755 })
	return location
}

/**
 * Put the fake java first on the PATH, call restore() to undo it
 * @returns {{directory: String, restore: Function}}
 */
function install () {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-java-'))
	write(directory)

	const originalPath = process.env.PATH
	process.env.PATH = `${directory}${path.delimiter}${originalPath}`

	return {
		directory,
		restore () {
			process.env.PATH = originalPath
			for (const variable of ['FAKE_JAVA', 'FAKE_JAVA_RUNTIME', 'FAKE_JAVA_TUNNEL', 'FAKE_JAVA_LOG']) {
				delete process.env[variable]
			}
			fs.rmSync(directory, { recursive: true, force: true })
		}
	}
}

module.exports = { script, write, install }
