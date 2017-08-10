'use strict'

const async = require('async')
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
        const tunnelFile = fs.statSync(tunnelLocation)
        if (tunnelFile['size'] > 1024) {
            return callback(null)
        }
    } catch (ignore) {}

    downloader.get(url, { fileName: 'testingbot-tunnel', destination: tunnelLocation }, (err, destination) => {
        if (err) {
            return callback(new Error(`Could not download the tunnel from TestingBot - please check your connection. ${err.message}`))
        }

        return callback(null)
    })
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

    const args = []

    args.push('-jar')
    args.push(tunnelLocation)

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

        if (options[option]) {
            args.push(`--${option}`)
            args.push(options[option])
        } else {
            args.push(`--${option}`)
        }
    }

    const readyFile = path.join(os.tmpdir(), 'testingbot.ready')
    try {
        if (fs.statSync(readyFile).isFile()) {
            logger('Tunnel Readyfile already exists, removing')
            fs.unlinkSync(readyFile)
        }
    } catch (ignore) {}

    args.push(`-f`)
    args.push(readyFile)

    const readyFileChecker = setInterval(() => {
        fs.stat(readyFile, (error, stat) => {
            if (!error) {
                clearInterval(readyFileChecker)
                onReady()
            }
        })
    }, 800)

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
        if (data.indexOf('error code : 401') > -1) {
            activeTunnel.error = 'Invalid credentials. Please supply the correct key/secret obtained from TestingBot.com'
            activeTunnel.close()
        } else if (data.toLowerCase().indexOf('error') > -1) {
            logger(data)
            activeTunnel.error = data
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
        logger('Closing TestingBot Tunnel')
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
