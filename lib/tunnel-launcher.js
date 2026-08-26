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
const DEFAULT_TIMEOUT = 90
const KILL_GRACE_PERIOD = 10000

// The tunnel writes everything the TestingBot API refuses behind this prefix,
// spelled the way the tunnel spells it
const TUNNEL_ERROR_PREFIX = 'An error ocurred:'

// How many lines of tunnel output to keep for a tunnel that fails to start
const MAX_REMEMBERED_LINES = 5

// Options handled by this launcher, the tunnel itself does not know about them
const LAUNCHER_OPTIONS = ['apiKey', 'apiSecret', 'verbose', 'tunnelVersion', 'timeout']

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

function validateJavaVersion (versionOutput) {
    const majorVersion = parseJavaVersion(versionOutput)

    if (majorVersion === null) {
        return { valid: false, version: null, error: 'Could not determine Java version. Please ensure Java 11 or higher is installed for testingbot-tunnel.' }
    }

    if (majorVersion < MIN_JAVA_VERSION) {
        return { valid: false, version: majorVersion, error: `Java ${majorVersion} is installed, but Java ${MIN_JAVA_VERSION} or higher is required for testingbot-tunnel.` }
    }

    return { valid: true, version: majorVersion, error: null }
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
}

/**
 * Check if Java is installed and meets minimum version requirement
 * @returns {Promise<{version: number}>}
 */
async function checkJava () {
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
            const result = validateJavaVersion(javaVersionOutput)
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
 * @param {String} jarLocation
 * @returns {Promise<Boolean>}
 */
async function isJarValid (jarLocation) {
    return new Promise(resolve => {
        const validateProcess = spawn('java', ['-jar', jarLocation, '-h'], { stdio: 'ignore' })

        validateProcess.on('error', () => resolve(false))
        validateProcess.on('close', code => resolve(code === 0))
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

    const optionMapping = {
        'tunnelIdentifier': 'tunnel-identifier',
        'noBump': 'nobump',
        'noCache': 'nocache',
        'shared': 'shared'
    }

    for (const option in options) {
        if (LAUNCHER_OPTIONS.includes(option)) {
            continue
        }

        const optionName = optionMapping[option] || option
        const value = options[option]

        if (value === undefined || value === null || value === false) {
            continue
        }

        if (value === true) {
            args.push(`--${optionName}`)
        } else if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) {
            args.push(`--${optionName}`)
            args.push(String(value))
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

    // Reported without the prefix when the tunnel can not reach TestingBot at all
    if (line.startsWith('Creating a new tunnel failed')) {
        return line
    }

    return null
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

        const readStderr = createLineReader(line => {
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
        })

        const readStdout = createLineReader(line => {
            line = redactCredentials(line, options)

            if (options.verbose && line !== '') {
                console.log(line)
            }
        })

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

    await checkJava()

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
