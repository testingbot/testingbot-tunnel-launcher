'use strict'

const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const downloader = require('./downloader')

let tunnelLocation
let activeTunnel
let started = false

const MIN_JAVA_VERSION = 11
const DEFAULT_TIMEOUT = 90
const KILL_GRACE_PERIOD = 10000

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
 * Download the tunnel JAR file
 * @param {Object} options
 * @returns {Promise<void>}
 */
async function downloadAsync (options = {}) {
    tunnelLocation = path.normalize(path.join(__dirname, '../testingbot-tunnel.jar'))

    let url = 'https://testingbot.com/tunnel/testingbot-tunnel.jar'

    if (options.tunnelVersion) {
        tunnelLocation = path.normalize(path.join(__dirname, `../testingbot-tunnel-${options.tunnelVersion}.jar`))
        url = `https://testingbot.com/tunnel/testingbot-tunnel-${options.tunnelVersion}.jar`
    }

    if (fs.existsSync(tunnelLocation)) {
        if (await isJarValid(tunnelLocation)) {
            return
        }
        console.log('Found a cached testingbot-tunnel.jar file, but it might be corrupt. Redownloading.')
    }

    return new Promise((resolve, reject) => {
        downloader.get(url, { fileName: 'testingbot-tunnel', destination: tunnelLocation }, (err) => {
            if (err) {
                reject(new Error(`Could not download the tunnel from TestingBot - please check your connection. ${err.message}`))
            } else {
                resolve()
            }
        })
    })
}

function createArgs (options) {
    // apiKey/apiSecret are deliberately not added here: they are passed to the
    // tunnel through the environment so they do not show up in the process list
    const args = []

    args.push('-jar')
    args.push(tunnelLocation)

    const optionMapping = {
        'tunnelIdentifier': 'tunnel-identifier',
        'noBump': 'nobump',
        'noCache': 'nocache',
        'shared': 'shared'
    }

    for (const option in options) {
        if ((option === 'apiKey') || (option === 'apiSecret') || (option === 'verbose') || (option === 'tunnelVersion')) {
            continue
        }

        const optionName = optionMapping[option] || option

        if (options[option] && typeof (options[option]) === 'string') {
            args.push(`--${optionName}`)
            args.push(options[option])
        } else if (options[option]) {
            args.push(`--${optionName}`)
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
    } catch (ignore) {}
}

/**
 * Start the tunnel process
 * @param {Object} options
 * @returns {Promise<ChildProcess>}
 */
async function startTunnelAsync (options = {}) {
    const readyFile = await createReadyFilePath()

    const args = createArgs(options)
    args.push('-f')
    args.push(readyFile)

    if (options.verbose) {
        console.log('Starting tunnel with options', redactCredentials(args, options))
    }

    activeTunnel = spawn('java', args, { env: createEnv(options) })

    return new Promise((resolve, reject) => {
        let waitCounter = 0
        let settled = false
        const timeout = options.timeout || DEFAULT_TIMEOUT

        const onReady = () => {
            if (settled) return
            settled = true
            started = true
            clearInterval(readyFileChecker)
            console.log('Tunnel is ready')
            resolve(activeTunnel)
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

        activeTunnel.stderr.on('data', data => {
            data = redactCredentials(data.toString().trim(), options)
            if (options.verbose && data !== '') {
                console.log(data)
            }
            if (data.indexOf('is available for download') > -1) {
                console.log(data)
            }
            if (data.indexOf('401 Unauthorized') > -1) {
                activeTunnel.error = 'Invalid credentials. Please supply the correct key/secret obtained from TestingBot.com'
                activeTunnel.close()
            } else if (data.indexOf('minutes left') > -1) {
                activeTunnel.error = 'You do not have any minutes left. Please upgrade your account at TestingBot.com'
                activeTunnel.close()
            }
        })

        activeTunnel.stdout.on('data', data => {
            data = redactCredentials(data.toString().trim(), options)
            if (options.verbose && data !== '') {
                console.log(data)
            }
        })

        let closing = false
        activeTunnel.close = closeCallback => {
            if (closeCallback) {
                activeTunnel.once('close', closeCallback)
            }
            if (!closing) {
                closing = true
                activeTunnel.kill('SIGINT')
            }
        }

        activeTunnel.on('exit', (code, signal) => {
            if (options.verbose) {
                console.log('Closing TestingBot Tunnel')
            }

            removeReadyFilePath(readyFile)

            if (!started) {
                onError(new Error(activeTunnel.error ? activeTunnel.error : `Could not start TestingBot Tunnel. Exit code ${code} signal: ${signal}`))
            }

            started = false
            activeTunnel = null
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
    await downloadAsync(options)

    if (!fs.existsSync(tunnelLocation)) {
        throw new Error(`Tunnel jar file is not present in ${tunnelLocation}`)
    }

    await checkJava()

    return startTunnelAsync(options)
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
 * Kill the active tunnel (async version)
 * @returns {Promise<void>}
 */
async function killTunnelAsync () {
    if (!activeTunnel) {
        throw new Error('no active tunnel')
    }

    await stopProcess(activeTunnel)
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
module.exports.createReadyFilePath = createReadyFilePath
module.exports.removeReadyFilePath = removeReadyFilePath
module.exports.stopProcess = stopProcess
module.exports.redactCredentials = redactCredentials
module.exports.createEnv = createEnv

module.exports.downloadAndRunAsync = downloadAndRunAsync
module.exports.killAsync = killTunnelAsync
module.exports.downloadAsync = downloadAsync
module.exports.startTunnelAsync = startTunnelAsync
