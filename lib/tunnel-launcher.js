'use strict'

const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const downloader = require('./downloader')

let tunnelLocation
let activeTunnel

// Every tunnel that is still running, in the order they were started
const activeTunnels = new Set()
let exitHandlerRegistered = false

const MIN_JAVA_VERSION = 11
// TestingBot Tunnel 5.0 and up are built for Java 17
const MIN_JAVA_VERSION_5 = 17
const DEFAULT_TIMEOUT = 90
const KILL_GRACE_PERIOD = 10000

// The tunnel writes everything the TestingBot API refuses behind this prefix,
// spelled the way the tunnel spells it
const TUNNEL_ERROR_PREFIX = 'An error ocurred:'

// What TestingBot Tunnel 5.0 and up write when Java is too old for them
const JAVA_REQUIREMENT = /TestingBot Tunnel requires Java \d+ or higher/

// How TestingBot Tunnel 5.0 and up report the TestingBot API refusing to create a tunnel,
// e.g. 'Failed : HTTP error code : 401 - {"error":"401 Unauthorized. ..."}'
const HTTP_ERROR = /HTTP error code : (\d+)(?: - (.*))?$/

// How many lines of tunnel output to keep for a tunnel that fails to start
const MAX_REMEMBERED_LINES = 5

// Options handled by this launcher, the tunnel itself does not know about them
const LAUNCHER_OPTIONS = ['apiKey', 'apiSecret', 'verbose', 'tunnelVersion', 'timeout']

// Options that are spelled differently on the command line of the tunnel
const OPTION_MAPPING = {
    'tunnelIdentifier': 'tunnel-identifier',
    'noBump': 'nobump',
    'noCache': 'nocache',
    'shared': 'shared',
    'metricsPort': 'metrics-port',
    'metricsAuth': 'metrics-auth',
    'extraHeaders': 'extra-headers',
    // Added in TestingBot Tunnel 5.0
    'allowHosts': 'allow-hosts',
    'bindAddress': 'bind-address',
    'cacertFile': 'cacert-file',
    'connectTo': 'connect-to',
    'dnsRoundRobin': 'dns-round-robin',
    'dnsTimeout': 'dns-timeout',
    'responseHeader': 'response-header',
    'httpDialTimeout': 'http-dial-timeout',
    'httpIdleTimeout': 'http-idle-timeout',
    'krb5Hosts': 'krb5-hosts',
    'krb5Keytab': 'krb5-keytab',
    'krb5Principal': 'krb5-principal',
    'localhostPolicy': 'localhost-policy',
    'logFormat': 'log-format',
    'logHttp': 'log-http',
    'logLevel': 'log-level',
    'requestIdHeader': 'request-id-header',
    'noBumpDomains': 'nobump-domains',
    'pacLocal': 'pac-local',
    'pacLocalSha256': 'pac-local-sha256',
    'proxyAuthScheme': 'proxy-auth-scheme',
    'proxySpn': 'proxy-spn',
    'proxyTestingbot': 'proxy-testingbot',
    'proxyTestingbotUserpwd': 'proxy-testingbot-userpwd',
    'sshHostKey': 'ssh-host-key',
    'sshHostKeyPolicy': 'ssh-host-key-policy',
    'wsProxyMode': 'ws-proxy-mode'
}

// Options the tunnel only knows about from version 5.0 on, as they are
// spelled on its command line. Older tunnels refuse to start with them.
const VERSION_5_OPTIONS = [
    'allow-hosts', 'bind-address', 'cacert-file', 'config', 'connect-to',
    'dns-round-robin', 'dns-timeout', 'header', 'response-header',
    'http-dial-timeout', 'http-idle-timeout', 'krb5-hosts', 'krb5-keytab',
    'krb5-principal', 'localhost-policy', 'log-format', 'log-http', 'log-level',
    'request-id-header', 'nobump-domains', 'pac-local', 'pac-local-sha256',
    'proxy-auth-scheme', 'proxy-spn', 'proxy-testingbot', 'proxy-testingbot-userpwd',
    'ssh-host-key', 'ssh-host-key-policy', 'ws-proxy-mode'
]

/**
 * The last entry of a set, the most recently started tunnel
 * @param {Set} set
 * @returns {*}
 */
function lastOf (set) {
    let last
    for (const entry of set) {
        last = entry
    }
    return last
}

function parseJavaVersion (versionOutput) {
    const versionMatch = versionOutput.match(/version "(\d+)/)
    if (!versionMatch) {
        return null
    }
    return parseInt(versionMatch[1], 10)
}

function validateJavaVersion (versionOutput, minVersion = MIN_JAVA_VERSION) {
    const majorVersion = parseJavaVersion(versionOutput)

    if (majorVersion === null) {
        return { valid: false, version: null, error: `Could not determine Java version. Please ensure Java ${minVersion} or higher is installed for testingbot-tunnel.` }
    }

    if (majorVersion < minVersion) {
        return { valid: false, version: majorVersion, error: `Java ${majorVersion} is installed, but Java ${minVersion} or higher is required for testingbot-tunnel.` }
    }

    return { valid: true, version: majorVersion, error: null }
}

/**
 * Check whether a tunnel version is 5.0 or newer
 * @param {String} [tunnelVersion] - e.g. "4.9" or "5.0"
 * @returns {Boolean|null} null when the version is not known
 */
function isVersion5OrUp (tunnelVersion) {
    const major = parseInt(tunnelVersion, 10)
    if (Number.isNaN(major)) {
        return null
    }
    return major >= 5
}

/**
 * The Java version a tunnel version needs
 * @param {String} [tunnelVersion]
 * @returns {Number}
 */
function requiredJavaVersion (tunnelVersion) {
    return isVersion5OrUp(tunnelVersion) ? MIN_JAVA_VERSION_5 : MIN_JAVA_VERSION
}

/**
 * The name of an option on the command line of the tunnel
 * @param {String} option
 * @returns {String}
 */
function tunnelOptionName (option) {
    return OPTION_MAPPING[option] || option
}

/**
 * Refuse options the tunnel does not know about yet.
 * An older tunnel would refuse to start with them, with a less helpful message.
 * @param {Object} options
 * @param {String|null} tunnelVersion - the version of the jar, null when not known
 * @throws {Error} If an option needs a newer tunnel
 */
function validateOptionsForVersion (options, tunnelVersion) {
    if (isVersion5OrUp(tunnelVersion) !== false) {
        return
    }

    for (const option in options) {
        const value = options[option]
        if (value === undefined || value === null || value === false) {
            continue
        }

        if (VERSION_5_OPTIONS.includes(tunnelOptionName(option))) {
            throw new Error(`${option} requires TestingBot Tunnel 5.0 or higher, but version ${tunnelVersion} is used. Set tunnelVersion to "5.0" or higher.`)
        }
    }
}

/**
 * Validate options passed to the tunnel launcher
 * @param {Object} options
 * @throws {Error} If options are invalid
 */
function validateOptions (options) {
    if (options.apiKey !== undefined && typeof options.apiKey !== 'string') {
        throw new Error('apiKey must be a string')
    }
    if (options.apiSecret !== undefined && typeof options.apiSecret !== 'string') {
        throw new Error('apiSecret must be a string')
    }
    if (typeof options.apiKey === 'string' && options.apiKey.trim() === '') {
        throw new Error('apiKey cannot be empty')
    }
    if (typeof options.apiSecret === 'string' && options.apiSecret.trim() === '') {
        throw new Error('apiSecret cannot be empty')
    }
    if (options.tunnelVersion !== undefined && typeof options.tunnelVersion !== 'string') {
        throw new Error('tunnelVersion must be a string')
    }
    if (options.tunnelIdentifier !== undefined && typeof options.tunnelIdentifier !== 'string') {
        throw new Error('tunnelIdentifier must be a string')
    }
    if (options.timeout !== undefined && (typeof options.timeout !== 'number' || options.timeout <= 0)) {
        throw new Error('timeout must be a positive number')
    }
    if (options.shared !== undefined && typeof options.shared !== 'boolean') {
        throw new Error('shared must be a boolean')
    }
    for (const option in options) {
        const value = options[option]
        if (Array.isArray(value) && !value.every(entry => typeof entry === 'string' || typeof entry === 'number')) {
            throw new Error(`${option} must be a list of strings`)
        }
    }
}

/**
 * Check if Java is installed and meets minimum version requirement
 * @param {Number} [minVersion] - the Java version the tunnel needs
 * @returns {Promise<{version: number}>}
 */
async function checkJava (minVersion = MIN_JAVA_VERSION) {
    return new Promise((resolve, reject) => {
        const checkJava = spawn('java', ['-version'])
        let javaVersionOutput = ''

        checkJava.on('error', err => {
            reject(new Error(`Java might not be installed or not in $PATH. Java is necessary to use testingbot-tunnel ${err.message}`))
        })

        checkJava.stderr.on('data', data => {
            javaVersionOutput += data.toString()
        })

        checkJava.on('close', () => {
            const result = validateJavaVersion(javaVersionOutput, minVersion)
            if (!result.valid) {
                if (result.version === null) {
                    console.warn(result.error)
                    resolve({ version: null })
                } else {
                    reject(new Error(result.error))
                }
            } else {
                resolve({ version: result.version })
            }
        })
    })
}

/**
 * Check whether a cached jar file can be run.
 * Only the exit code is used: the JVM writes messages such as
 * "Picked up JAVA_TOOL_OPTIONS" to stderr for a perfectly valid jar.
 * A tunnel that refuses to run on the installed Java is not corrupt either,
 * downloading it again would not help.
 * @param {String} jarLocation
 * @returns {Promise<Boolean>}
 */
async function isJarValid (jarLocation) {
    return new Promise(resolve => {
        const validateProcess = spawn('java', ['-jar', jarLocation, '-h'], { stdio: ['ignore', 'ignore', 'pipe'] })
        let output = ''

        validateProcess.stderr.on('data', data => {
            output += data.toString()
        })

        validateProcess.on('error', () => resolve(false))
        validateProcess.on('close', code => resolve(code === 0 || JAVA_REQUIREMENT.test(output)))
    })
}

/**
 * Ask a jar which version of the tunnel it is
 * @param {String} jarLocation
 * @returns {Promise<String|null>} e.g. "5.0", or null when it could not be determined
 */
async function readJarVersion (jarLocation) {
    return new Promise(resolve => {
        const versionProcess = spawn('java', ['-jar', jarLocation, '--version'], { stdio: ['ignore', 'pipe', 'ignore'] })
        let output = ''

        versionProcess.stdout.on('data', data => {
            output += data.toString()
        })

        versionProcess.on('error', () => resolve(null))
        versionProcess.on('close', () => {
            const versionMatch = output.match(/Version: \S+ (\d+(?:\.\d+)*)/)
            resolve(versionMatch ? versionMatch[1] : null)
        })
    })
}

/**
 * The directory of this package, the first place the jar is kept
 * @returns {String}
 */
function packageDirectory () {
    return path.normalize(path.join(__dirname, '..'))
}

/**
 * The directory the jar is kept in when this package can not be written to,
 * which is the case for global installs and read-only images
 * @returns {String}
 */
function cacheDirectory () {
    if (process.env.TESTINGBOT_TUNNEL_CACHE_DIR) {
        return process.env.TESTINGBOT_TUNNEL_CACHE_DIR
    }

    let base
    if (process.platform === 'darwin') {
        base = path.join(os.homedir(), 'Library', 'Caches')
    } else if (process.platform === 'win32') {
        base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    } else {
        base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
    }

    return path.join(base, 'testingbot-tunnel-launcher')
}

/**
 * Check whether a directory can be written to
 * @param {String} directory
 * @returns {Boolean}
 */
function isWritableDirectory (directory) {
    try {
        fs.accessSync(directory, fs.constants.W_OK)
        return true
    } catch {
        return false
    }
}

/**
 * All places a jar can be kept, in the order they are looked at
 * @param {String} jarName
 * @returns {Array<String>}
 */
function jarLocations (jarName) {
    const directories = [packageDirectory(), cacheDirectory()]
    return [...new Set(directories)].map(directory => path.join(directory, jarName))
}

/**
 * The place to download a jar to: the first directory we can write to
 * @param {String} jarName
 * @param {Array<String>} locations - the locations to pick from
 * @returns {String}
 */
function writableJarLocation (jarName, locations = jarLocations(jarName)) {
    for (const location of locations) {
        const directory = path.dirname(location)

        try {
            fs.mkdirSync(directory, { recursive: true })
        } catch {
            // The next check tells us whether we can use this location
        }

        if (isWritableDirectory(directory)) {
            return location
        }
    }

    throw new Error(`Could not write the tunnel jar to ${locations.map(location => path.dirname(location)).join(' or ')}. Set TESTINGBOT_TUNNEL_CACHE_DIR to a directory that can be written to.`)
}

/**
 * Download the tunnel JAR file
 * @param {Object} options
 * @returns {Promise<String>} the location of the jar
 */
async function downloadAsync (options = {}) {
    const jarName = options.tunnelVersion ? `testingbot-tunnel-${options.tunnelVersion}.jar` : 'testingbot-tunnel.jar'
    const url = `https://testingbot.com/tunnel/${jarName}`

    for (const location of jarLocations(jarName)) {
        if (!fs.existsSync(location)) {
            continue
        }

        if (await isJarValid(location)) {
            tunnelLocation = location
            return location
        }

        console.log(`Found a cached ${jarName} file in ${path.dirname(location)}, but it might be corrupt. Redownloading.`)
    }

    tunnelLocation = writableJarLocation(jarName)
    const destination = tunnelLocation

    return new Promise((resolve, reject) => {
        downloader.get(url, { fileName: 'testingbot-tunnel', destination }, (err) => {
            if (err) {
                reject(new Error(`Could not download the tunnel from TestingBot - please check your connection. ${err.message}`))
            } else {
                resolve(destination)
            }
        })
    })
}

function createArgs (options, jarLocation = tunnelLocation) {
    // apiKey/apiSecret are deliberately not added here: they are passed to the
    // tunnel through the environment so they do not show up in the process list
    const args = []

    args.push('-jar')
    args.push(jarLocation)

    for (const option in options) {
        if (LAUNCHER_OPTIONS.includes(option)) {
            continue
        }

        const optionName = tunnelOptionName(option)
        const value = options[option]

        if (value === undefined || value === null || value === false) {
            continue
        }

        // Options such as header and cacert-file can be given more than once
        const values = Array.isArray(value) ? value : [value]

        for (const entry of values) {
            if (entry === true) {
                args.push(`--${optionName}`)
            } else if (typeof entry === 'number' || (typeof entry === 'string' && entry.trim() !== '')) {
                args.push(`--${optionName}`)
                args.push(String(entry))
            }
        }
    }

    return args
}

/**
 * Build the environment for the tunnel process.
 * The tunnel reads TESTINGBOT_KEY/TESTINGBOT_SECRET when no key/secret
 * are passed as arguments, which keeps them out of the process list.
 * @param {Object} options
 * @returns {Object}
 */
function createEnv (options) {
    const env = { ...process.env }

    if (options.apiKey) {
        env.TESTINGBOT_KEY = options.apiKey
    }

    if (options.apiSecret) {
        env.TESTINGBOT_SECRET = options.apiSecret
    }

    return env
}

/**
 * Replace any occurrence of the credentials with a placeholder,
 * so verbose logging never leaks the key/secret
 * @param {String|Array} value
 * @param {Object} options
 * @returns {String|Array}
 */
function redactCredentials (value, options = {}) {
    const secrets = [options.apiKey, options.apiSecret].filter(secret => typeof secret === 'string' && secret.trim() !== '')

    if (secrets.length === 0) {
        return value
    }

    const redact = input => secrets.reduce((acc, secret) => acc.split(secret).join('***'), input)

    if (Array.isArray(value)) {
        return value.map(entry => typeof entry === 'string' ? redact(entry) : entry)
    }

    return typeof value === 'string' ? redact(value) : value
}

/**
 * Read a stream chunk by chunk and hand out whole lines.
 * The tunnel writes its output in chunks that can split a line in two,
 * which would hide messages such as "401 Unauthorized" from us.
 * @param {Function} onLine - called with every line, without the line ending
 * @returns {Function} the chunk handler, with a flush() for the last line
 */
function createLineReader (onLine) {
    let buffer = ''

    const handleChunk = chunk => {
        buffer += chunk.toString()

        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop()

        for (const line of lines) {
            onLine(line.trim())
        }
    }

    handleChunk.flush = () => {
        if (buffer === '') {
            return
        }

        const line = buffer
        buffer = ''
        onLine(line.trim())
    }

    return handleChunk
}

/**
 * Create the path for the readyfile the tunnel touches once it is up.
 * Every tunnel gets its own private directory, so tunnels running next to
 * each other can not see (or remove) each other's readyfile.
 * @returns {Promise<String>}
 */
async function createReadyFilePath () {
    const readyDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'testingbot-tunnel-'))
    return path.join(readyDir, 'testingbot.ready')
}

/**
 * Remove the private directory holding the readyfile
 * @param {String} readyFile
 * @returns {Promise<void>}
 */
async function removeReadyFilePath (readyFile) {
    try {
        await fsp.rm(path.dirname(readyFile), { recursive: true, force: true })
    } catch {
        // Nothing we can do about a directory we can not remove
    }
}

/**
 * Stop tunnels without waiting for them, for use while this process is exiting.
 * Only work that can be done synchronously is possible at that point.
 * @param {Iterable} tunnels
 */
function stopTunnelsSync (tunnels) {
    for (const tunnel of tunnels) {
        try {
            tunnel.kill('SIGINT')
        } catch {
            // The tunnel is already gone
        }

        if (tunnel.readyFile) {
            try {
                fs.rmSync(path.dirname(tunnel.readyFile), { recursive: true, force: true })
            } catch {
                // Nothing we can do about a directory we can not remove
            }
        }
    }
}

/**
 * Make sure tunnels do not outlive this process.
 * Without this a tunnel keeps running when the process that started it
 * exits without closing it, for example when it throws.
 */
function registerExitHandler () {
    if (exitHandlerRegistered) {
        return
    }

    exitHandlerRegistered = true
    process.on('exit', () => stopTunnelsSync(activeTunnels))
}

/**
 * Turn a line the tunnel wrote into the reason it could not start.
 * Everything the TestingBot API refuses is reported by the tunnel with the
 * same prefix, so its own wording is used for the cases without a friendlier
 * message of our own: no minutes, too many tunnels, a suspended account.
 * @param {String} line
 * @returns {String|null} the reason, or null when the line is not an error
 */
function classifyTunnelError (line) {
    if (line.indexOf('401 Unauthorized') > -1) {
        return 'Invalid credentials. Please supply the correct key/secret obtained from TestingBot.com'
    }

    if (line.indexOf('minutes left') > -1) {
        return 'You do not have any minutes left. Please upgrade your account at TestingBot.com'
    }

    if (line.startsWith(TUNNEL_ERROR_PREFIX)) {
        return line.slice(TUNNEL_ERROR_PREFIX.length).trim() || line
    }

    // Tunnel 5.0 and up pass on the answer of the API, which explains itself
    const httpError = line.match(HTTP_ERROR)
    if (httpError) {
        return describeApiRefusal(httpError[1], httpError[2])
    }

    // Reported without the prefix when the tunnel can not reach TestingBot at all.
    // Tunnel 5.0 and up write this first and the reason on a later line, which replaces it.
    if (line.startsWith('Creating a new tunnel failed')) {
        return line
    }

    if (JAVA_REQUIREMENT.test(line)) {
        return line
    }

    return null
}

/**
 * The reason the TestingBot API gave for not creating a tunnel
 * @param {String} statusCode
 * @param {String} [body] - the answer of the API, usually {"error": "..."}
 * @returns {String}
 */
function describeApiRefusal (statusCode, body) {
    if (body) {
        try {
            const answer = JSON.parse(body)
            if (answer && typeof answer.error === 'string' && answer.error.trim() !== '') {
                return answer.error.trim()
            }
        } catch {
            // Not JSON, the answer is passed on as it is
        }
        return body.trim()
    }

    return `TestingBot refused to create the tunnel, HTTP status ${statusCode}`
}

/**
 * The lines of a message the tunnel wrote.
 * With logFormat "json" tunnel 5.0 and up write every message as a JSON object,
 * which can hold several lines. Other output is a line of its own.
 * @param {String} line
 * @returns {Array<String>}
 */
function parseLogLine (line) {
    if (!line.startsWith('{')) {
        return [line]
    }

    try {
        const record = JSON.parse(line)
        if (record && typeof record.message === 'string') {
            return record.message.split(/\r?\n/).map(entry => entry.trim())
        }
    } catch {
        // Not a log record, but output that happens to start with a brace
    }

    return [line]
}

/**
 * Describe why the tunnel did not start.
 * Not everything the tunnel writes before it gives up is a message we
 * recognise: an option it does not know, a port it can not open, a jar java
 * refuses to run. Whatever it wrote last is added to the exit code, so the
 * caller is not left with a number.
 * @param {Object} failure
 * @param {String} [failure.error] - the reason we recognised, if any
 * @param {Number} failure.code
 * @param {String} failure.signal
 * @param {Array<String>} [failure.output] - the last lines the tunnel wrote
 * @returns {String}
 */
function describeStartupFailure ({ error, code, signal, output = [] }) {
    if (error) {
        return error
    }

    const message = `Could not start TestingBot Tunnel. Exit code ${code} signal: ${signal}`
    const lines = output.filter(line => line !== '')

    return lines.length === 0 ? message : `${message}\n${lines.join('\n')}`
}

/**
 * Start the tunnel process
 * @param {Object} options
 * @returns {Promise<ChildProcess>}
 */
async function startTunnelAsync (options = {}, jarLocation = tunnelLocation) {
    const readyFile = await createReadyFilePath()

    const args = createArgs(options, jarLocation)
    args.push('-f')
    args.push(readyFile)

    if (options.verbose) {
        console.log('Starting tunnel with options', redactCredentials(args, options))
    }

    const tunnel = spawn('java', args, { env: createEnv(options) })
    tunnel.readyFile = readyFile

    activeTunnels.add(tunnel)
    activeTunnel = tunnel
    registerExitHandler()

    return new Promise((resolve, reject) => {
        let waitCounter = 0
        let settled = false
        let ready = false
        const recentOutput = []
        const timeout = options.timeout || DEFAULT_TIMEOUT

        const onReady = () => {
            if (settled) return
            settled = true
            ready = true
            clearInterval(readyFileChecker)
            console.log('Tunnel is ready')
            resolve(tunnel)
        }

        const onError = (error) => {
            if (settled) return
            settled = true
            clearInterval(readyFileChecker)
            reject(error)
        }

        const checkReadyFile = async () => {
            try {
                await fsp.access(readyFile, fs.constants.F_OK)
                onReady()
            } catch {
                waitCounter += 1
                if (waitCounter > timeout) {
                    const errorMessage = `Tunnel failed to launch in ${waitCounter} seconds.`
                    console.log(errorMessage)
                    onError(new Error(errorMessage))
                }
            }
        }

        const readyFileChecker = setInterval(checkReadyFile, 1000)

        const onStderrLine = line => {
            line = redactCredentials(line, options)

            if (line !== '') {
                recentOutput.push(line)
                if (recentOutput.length > MAX_REMEMBERED_LINES) {
                    recentOutput.shift()
                }
            }

            if (options.verbose && line !== '') {
                console.log(line)
            }
            if (line.indexOf('is available for download') > -1) {
                console.log(line)
            }
            const error = classifyTunnelError(line)
            if (error) {
                tunnel.error = error
                tunnel.close()
            }
        }

        const onStdoutLine = line => {
            line = redactCredentials(line, options)

            if (options.verbose && line !== '') {
                console.log(line)
            }
        }

        const readStderr = createLineReader(line => parseLogLine(line).forEach(onStderrLine))
        const readStdout = createLineReader(line => parseLogLine(line).forEach(onStdoutLine))

        tunnel.stderr.on('data', readStderr)
        tunnel.stderr.on('end', () => readStderr.flush())

        tunnel.stdout.on('data', readStdout)
        tunnel.stdout.on('end', () => readStdout.flush())

        let closing = false
        tunnel.close = closeCallback => {
            if (closeCallback) {
                tunnel.once('close', closeCallback)
            }
            if (!closing) {
                closing = true
                tunnel.kill('SIGINT')
            }
        }

        tunnel.on('exit', (code, signal) => {
            if (options.verbose) {
                console.log('Closing TestingBot Tunnel')
            }

            activeTunnels.delete(tunnel)
            if (activeTunnel === tunnel) {
                activeTunnel = lastOf(activeTunnels)
            }

            // Report the failure once the readyfile is cleaned up,
            // so nothing is left behind by the time the caller hears about it
            removeReadyFilePath(readyFile).then(() => {
                if (!ready) {
                    onError(new Error(describeStartupFailure({ error: tunnel.error, code, signal, output: recentOutput })))
                }
            })
        })
    })
}

/**
 * Download and run the tunnel (async version)
 * @param {Object} options
 * @returns {Promise<ChildProcess>}
 */
async function downloadAndRunAsync (options = {}) {
    validateOptions(options)
    const jarLocation = await downloadAsync(options)

    if (!fs.existsSync(jarLocation)) {
        throw new Error(`Tunnel jar file is not present in ${jarLocation}`)
    }

    // Without a tunnelVersion the latest tunnel is downloaded, ask it which version that is
    const tunnelVersion = options.tunnelVersion || await readJarVersion(jarLocation)
    validateOptionsForVersion(options, tunnelVersion)

    await checkJava(requiredJavaVersion(tunnelVersion))

    return startTunnelAsync(options, jarLocation)
}

/**
 * Ask a process to stop and wait until it is really gone.
 * A process that ignores SIGINT is killed after the grace period.
 * @param {ChildProcess} proc
 * @param {Number} gracePeriod - milliseconds to wait before sending SIGKILL
 * @returns {Promise<void>}
 */
function stopProcess (proc, gracePeriod = KILL_GRACE_PERIOD) {
    return new Promise(resolve => {
        if (proc.exitCode !== null || proc.signalCode !== null) {
            return resolve()
        }

        const forceKill = setTimeout(() => proc.kill('SIGKILL'), gracePeriod)
        forceKill.unref()

        proc.once('close', () => {
            clearTimeout(forceKill)
            resolve()
        })

        proc.kill('SIGINT')
    })
}

/**
 * Kill the tunnel that was started last (async version)
 * @returns {Promise<void>}
 */
async function killTunnelAsync () {
    if (!activeTunnel) {
        throw new Error('no active tunnel')
    }

    await stopProcess(activeTunnel)
}

/**
 * Kill every tunnel this process started (async version)
 * @returns {Promise<void>}
 */
async function killAllTunnelsAsync () {
    await Promise.all([...activeTunnels].map(tunnel => stopProcess(tunnel)))
}

function downloadAndRun (options, callback) {
    if (!options) {
        options = {}
    }

    if (!callback) {
        callback = function () {}
    }

    downloadAndRunAsync(options)
        .then(tunnel => callback(null, tunnel))
        .catch(err => callback(err))
}

function killTunnel (callback) {
    if (!callback) {
        callback = function () {}
    }

    killTunnelAsync()
        .then(() => callback(null))
        .catch(err => callback(err))
}

module.exports = downloadAndRun
module.exports.kill = killTunnel
module.exports.createArgs = createArgs
module.exports.checkJava = checkJava
module.exports.parseJavaVersion = parseJavaVersion
module.exports.validateJavaVersion = validateJavaVersion
module.exports.validateOptions = validateOptions
module.exports.validateOptionsForVersion = validateOptionsForVersion
module.exports.isVersion5OrUp = isVersion5OrUp
module.exports.requiredJavaVersion = requiredJavaVersion
module.exports.readJarVersion = readJarVersion
module.exports.parseLogLine = parseLogLine
module.exports.isJarValid = isJarValid
module.exports.cacheDirectory = cacheDirectory
module.exports.packageDirectory = packageDirectory
module.exports.isWritableDirectory = isWritableDirectory
module.exports.jarLocations = jarLocations
module.exports.writableJarLocation = writableJarLocation
module.exports.createReadyFilePath = createReadyFilePath
module.exports.removeReadyFilePath = removeReadyFilePath
module.exports.stopProcess = stopProcess
module.exports.stopTunnelsSync = stopTunnelsSync
module.exports.redactCredentials = redactCredentials
module.exports.createLineReader = createLineReader
module.exports.classifyTunnelError = classifyTunnelError
module.exports.describeStartupFailure = describeStartupFailure
module.exports.createEnv = createEnv

module.exports.downloadAndRunAsync = downloadAndRunAsync
module.exports.killAsync = killTunnelAsync
module.exports.killAllAsync = killAllTunnelsAsync
module.exports.activeTunnels = () => [...activeTunnels]
module.exports.downloadAsync = downloadAsync
module.exports.startTunnelAsync = startTunnelAsync
