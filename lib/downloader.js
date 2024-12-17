'use strict'

const https = require('https')
const fs = require('fs')

/**
 * Downloads a file from the given URL to the specified destination.
 * @param {string} url - The URL to download the file from.
 * @param {Object} options - The options object containing the destination.
 * @param {Function} cb - The callback function to handle success or error.
 */
exports.get = function (url, options, cb) {
    const dest = options.destination

    https.get(url, response => {
        if (response.statusCode >= 400) {
            return cb(new Error(`Could not download ${url}, statusCode: ${response.statusCode.toString()}`), null)
        }

        const file = fs.createWriteStream(dest)
        response.pipe(file)
        file.on('finish', () => {
            file.close()
            cb(null, dest)
        })
        file.on('error', err => {
            fs.unlink(dest, () => {})
            cb(err, null)
        })
    }).on('error', err => {
        cb(err, null)
    })
}
