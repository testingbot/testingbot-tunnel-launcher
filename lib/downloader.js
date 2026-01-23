'use strict'

const https = require('https')
const http = require('http')
const fs = require('fs')

const MAX_REDIRECTS = 5

/**
 * Downloads a file from the given URL to the specified destination.
 * Follows HTTP redirects (3xx) up to MAX_REDIRECTS times.
 * @param {string} url - The URL to download the file from.
 * @param {Object} options - The options object containing the destination.
 * @param {Function} cb - The callback function to handle success or error.
 * @param {number} redirectCount - Internal counter for redirect depth.
 */
exports.get = function (url, options, cb, redirectCount = 0) {
    const dest = options.destination

    // Choose http or https based on URL protocol
    const protocol = url.startsWith('https') ? https : http

    protocol.get(url, response => {
        // Handle redirects (3xx status codes)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            if (redirectCount >= MAX_REDIRECTS) {
                return cb(new Error(`Too many redirects (max ${MAX_REDIRECTS}) for ${url}`), null)
            }

            let redirectUrl = response.headers.location
            // Handle relative redirects
            if (redirectUrl.startsWith('/')) {
                const parsedUrl = new URL(url)
                redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`
            }

            // Consume the response to free up the socket
            response.resume()

            return exports.get(redirectUrl, options, cb, redirectCount + 1)
        }

        if (response.statusCode >= 400) {
            return cb(new Error(`Could not download ${url}, statusCode: ${response.statusCode.toString()}`), null)
        }

        const file = fs.createWriteStream(dest)
        response.pipe(file)
        file.on('finish', () => {
            file.close(err => {
                if (err) {
                    return cb(err, null)
                }
                cb(null, dest)
            })
        })
        file.on('error', err => {
            fs.unlink(dest, () => {})
            cb(err, null)
        })
    }).on('error', err => {
        cb(err, null)
    })
}
