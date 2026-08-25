'use strict'

const https = require('https')
const http = require('http')
const fs = require('fs')
const crypto = require('crypto')

const MAX_REDIRECTS = 5
const DOWNLOAD_TIMEOUT = 60000

/**
 * Resolve the target of a redirect against the URL we came from.
 * A redirect is not allowed to take us from https to http: the download
 * ends up being executed, so it should not travel in the clear.
 * @param {String} url - The URL that returned the redirect.
 * @param {String} location - The value of the location header.
 * @returns {String} The absolute URL to follow.
 * @throws {Error} If the redirect would drop the encryption.
 */
function resolveRedirect (url, location) {
    const currentUrl = new URL(url)
    const redirectUrl = new URL(location, currentUrl)

    if (currentUrl.protocol === 'https:' && redirectUrl.protocol !== 'https:') {
        throw new Error(`Refusing to follow the redirect from ${currentUrl.origin} to ${redirectUrl.origin}, the download would no longer be encrypted`)
    }

    return redirectUrl.href
}

/**
 * Downloads a file from the given URL to the specified destination.
 * The file is written to a temporary file first and renamed once it is
 * complete, so a half finished download never ends up at the destination
 * and downloads running next to each other do not write over each other.
 * Follows HTTP redirects (3xx) up to MAX_REDIRECTS times.
 * @param {string} url - The URL to download the file from.
 * @param {Object} options - The options object containing the destination.
 * @param {Function} cb - The callback function to handle success or error.
 * @param {number} redirectCount - Internal counter for redirect depth.
 */
exports.get = function (url, options, cb, redirectCount = 0) {
    const dest = options.destination
    const timeout = options.timeout || DOWNLOAD_TIMEOUT

    let settled = false
    const done = (err, result) => {
        if (settled) {
            return
        }
        settled = true
        cb(err, result)
    }

    // Choose http or https based on URL protocol
    const protocol = url.startsWith('https') ? https : http

    const request = protocol.get(url, response => {
        // Handle redirects (3xx status codes)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            // Consume the response to free up the socket
            response.resume()

            if (redirectCount >= MAX_REDIRECTS) {
                return done(new Error(`Too many redirects (max ${MAX_REDIRECTS}) for ${url}`), null)
            }

            let redirectUrl
            try {
                redirectUrl = exports.resolveRedirect(url, response.headers.location)
            } catch (err) {
                return done(err, null)
            }

            // The callback is handed over to the request we redirect to
            settled = true
            return exports.get(redirectUrl, options, cb, redirectCount + 1)
        }

        if (response.statusCode >= 400) {
            response.resume()
            return done(new Error(`Could not download ${url}, statusCode: ${response.statusCode.toString()}`), null)
        }

        const tempDest = `${dest}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.download`
        const file = fs.createWriteStream(tempDest)

        const failed = err => {
            response.destroy()
            file.destroy()
            fs.unlink(tempDest, () => done(err, null))
        }

        response.pipe(file)

        response.on('error', failed)

        file.on('error', failed)

        file.on('finish', () => {
            file.close(err => {
                if (err) {
                    return failed(err)
                }

                fs.rename(tempDest, dest, renameError => {
                    if (renameError) {
                        return failed(renameError)
                    }
                    done(null, dest)
                })
            })
        })
    })

    request.setTimeout(timeout, () => {
        request.destroy(new Error(`Timed out after ${timeout}ms while downloading ${url}`))
    })

    request.on('error', err => {
        done(err, null)
    })
}

exports.resolveRedirect = resolveRedirect
