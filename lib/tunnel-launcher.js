'use strict'

const async = require('async')
const { exec } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const spawn = require('child_process').spawn
const downloader = require('./downloader')
let tunnelLocation
let activeTunnel
let started = false

function logger (msg) {
    console.log.apply(console, arguments)
}

function download (options, callback) {
    tunnelLocation = path.normalize(path.join(__dirname, '../testingbot-tunnel.jar'))

    let url = 'https://testingbot.com/tunnel/testingbot-tunnel.jar'

    if (options.tunnelVersion) {
        tunnelLocation = path.normalize(path.join(__dirname, `../testingbot-tunnel-${options.tunnelVersion}.jar`))
        url = `https://testingbot.com/tunnel/testingbot-tunnel-${options.tunnelVersion}.jar`
    }

    try {
        const exists = fs.existsSync(tunnelLocation)
        if (exists) {
            return exec(`java -jar ${tunnelLocation} -h`, (error, stdout, stderr) => {
                if (error || stderr) {
                    logger('Found a cached testingbot-tunnel.jar file, but it might be corrupt. Redownloading.')
                    downloadTunnel(url, tunnelLocation, callback)
                } else {
                    callback(null)
                }
            })
        }
    } catch (ignore) {}

    return downloadTunnel(url, tunnelLocation, callback)
}

function downloadTunnel (url, tunnelLocation, callback) {
    downloader.get(url, { fileName: 'testingbot-tunnel', destination: tunnelLocation }, (err) => {
        if (err) {
            return callback(new Error(`Could not download the tunnel from TestingBot - please check your connection. ${err.message}`))
        }

        return callback(null)
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

function run (options, callback) {
    if (!fs.existsSync(tunnelLocation)) {
        return callback(new Error(`Tunnel jar file is not present in ${tunnelLocation}`))
    }

    const checkJava = spawn('java')
    checkJava.on('error', err => {
        return callback(new Error(`Java might not be installed, necessary to use testingbot-tunnel ${err.message}`))
    })

    const onReady = function () {
        started = true
        logger('Tunnel is ready')
        callback(null, activeTunnel)
    }

    const readyFile = path.join(os.tmpdir(), 'testingbot.ready')
    const readyFileChecker = setInterval(() => {
        fs.stat(readyFile, (error, stat) => {
            if (!error) {
                clearInterval(readyFileChecker)
                onReady()
            }
        })
    }, 800)

    const args = createArgs(options)

    try {
        if (fs.statSync(readyFile).isFile()) {
            logger('Tunnel Readyfile already exists, removing')
            fs.unlinkSync(readyFile)
        }
    } catch (ignore) {}

    args.push(`-f`)
    args.push(readyFile)

    if (options.verbose) {
        logger('Starting tunnel with options', args)
    }
    activeTunnel = spawn('java', args, {})

    activeTunnel.stderr.on('data', data => {
        data = data.toString().trim()
        if (options.verbose && data !== '') {
            logger(data)
        }
        if (data.indexOf('is available for download') > -1) {
            logger(data)
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
            logger(data)
        }
    })

    activeTunnel.close = closeCallback => {
        if (closeCallback) {
            if (!activeTunnel) {
                closeCallback()
            } else {
                activeTunnel.on('close', () => {
                    closeCallback()
                })
            }
        }
        activeTunnel.kill('SIGINT')
    }

    activeTunnel.on('exit', (code, signal) => {
        if (options.verbose) {
            logger('Closing TestingBot Tunnel')
        }
        if (!started) {
            callback(new Error(activeTunnel.error ? activeTunnel.error : `Could not start TestingBot Tunnel. Exit code ${code} signal: ${signal}`))
        }

        started = false
        activeTunnel = null
    })
}

function killTunnel (callback) {
    if (!callback) {
        callback = function () {}
    }

    if (!activeTunnel) {
        return callback(new Error('no active tunnel'))
    }

    activeTunnel.kill('SIGINT')
    callback(null)
}

function downloadAndRun (options, callback) {
    if (!options) {
        options = {}
    }

    if (!callback) {
        callback = function () {}
    }

    async.waterfall([
        async.apply(download, options),
        async.apply(run, options)
    ], callback)
}

module.exports = downloadAndRun
module.exports.kill = killTunnel
module.exports.createArgs = createArgs
