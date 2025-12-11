'use strict'

const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const path = require('path')
const { spawn, exec } = require('child_process')
const downloader = require('./downloader')

let tunnelLocation
let activeTunnel
let started = false

const MIN_JAVA_VERSION = 11

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

    const exists = fs.existsSync(tunnelLocation)
    if (exists) {
        const isValid = await new Promise(resolve => {
            exec(`java -jar ${tunnelLocation} -h`, (error, stdout, stderr) => {
                if (error || stderr) {
                    console.log('Found a cached testingbot-tunnel.jar file, but it might be corrupt. Redownloading.')
                    resolve(false)
                } else {
                    resolve(true)
                }
            })
        })

        if (isValid) {
            return
        }
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
    const args = []

    args.push('-jar')
    args.push(tunnelLocation)

    const optionMapping = {
        'tunnelIdentifier': 'tunnel-identifier',
        'noBump': 'nobump',
        'noCache': 'nocache'
    }

    if (options.apiKey) {
        args.push(options.apiKey)
    }

    if (options.apiSecret) {
        args.push(options.apiSecret)
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
 * Start the tunnel process
 * @param {Object} options
 * @returns {Promise<ChildProcess>}
 */
async function startTunnelAsync (options = {}) {
    const readyFile = path.join(os.tmpdir(), 'testingbot.ready')

    // Clean up existing ready file
    try {
        await fsp.unlink(readyFile)
        console.log('Tunnel Readyfile already exists, removing')
    } catch (ignore) {}

    const args = createArgs(options)
    args.push('-f')
    args.push(readyFile)

    if (options.verbose) {
        console.log('Starting tunnel with options', args)
    }

    activeTunnel = spawn('java', args, {})

    return new Promise((resolve, reject) => {
        let waitCounter = 0
        let settled = false

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
                if (waitCounter > 90) {
                    const errorMessage = `Tunnel failed to launch in ${waitCounter} seconds.`
                    console.log(errorMessage)
                    onError(new Error(errorMessage))
                }
            }
        }

        const readyFileChecker = setInterval(checkReadyFile, 1000)

        activeTunnel.stderr.on('data', data => {
            data = data.toString().trim()
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
            data = data.toString().trim()
            if (options.verbose && data !== '') {
                console.log(data)
            }
        })

        activeTunnel.close = closeCallback => {
            if (closeCallback) {
                activeTunnel.on('close', () => {
                    closeCallback()
                })
            }
            activeTunnel.kill('SIGINT')
        }

        activeTunnel.on('exit', (code, signal) => {
            if (options.verbose) {
                console.log('Closing TestingBot Tunnel')
            }
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
    await downloadAsync(options)

    if (!fs.existsSync(tunnelLocation)) {
        throw new Error(`Tunnel jar file is not present in ${tunnelLocation}`)
    }

    await checkJava()

    return startTunnelAsync(options)
}

/**
 * Kill the active tunnel (async version)
 * @returns {Promise<void>}
 */
async function killTunnelAsync () {
    if (!activeTunnel) {
        throw new Error('no active tunnel')
    }

    activeTunnel.kill('SIGINT')
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

module.exports.downloadAndRunAsync = downloadAndRunAsync
module.exports.killAsync = killTunnelAsync
module.exports.downloadAsync = downloadAsync
module.exports.startTunnelAsync = startTunnelAsync
