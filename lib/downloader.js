'use strict'

const https = require('https')
const fs = require('fs')

exports.get = function (url, options, cb) {
    const dest = options.destination

    https.get(url, response => {
        if (parseInt(response.statusCode.toString().substring(0, 1), 10) > 3) {
            return cb(new Error(`Could not download ${url}, statusCode: ${response.statusCode.toString()}`), null)
        }

        const file = fs.createWriteStream(dest)
        response.pipe(file)
        file.on('finish', () => {
            file.close()
            cb(null, dest)
        })
    }).on('error', e => {
        cb(e.message, null)
    })
}
