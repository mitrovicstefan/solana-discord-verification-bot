import { initializeCOS, listCOSFiles, readCOSFile, useCOS, writeCOSFile } from "./ibm-cos";

const fs = require('fs')

export function initializeStorage() {

    // enable COS bucket storage if present in config
    var cosConfigStr = (process.env.COS_CONFIG) ? process.env.COS_CONFIG : ""
    if (cosConfigStr != "") {
        var cosConfig = JSON.parse(cosConfigStr)
        initializeCOS({
            endpoint: cosConfig.endpoint,
            apiKey: cosConfig.apiKey,
            instanceID: cosConfig.instanceID,
            storageClass: cosConfig.storageClass,
            bucket: cosConfig.bucket
        })
    }
}

export async function list(directoryPath: string, filter: string) {
    console.log(`listing files in directory ${directoryPath}`)
    if (useCOS()) {
        return await listCOSFiles(`${directoryPath}/${filter}`.replaceAll("./", ""))
    }
    try {
        var matchingFiles: string[] = []
        var filenames = fs.readdirSync(directoryPath)
        filenames.forEach((file: string) => {
            if (file.includes(filter)) {
                matchingFiles.push(file)
            }
        })
        return matchingFiles
    } catch (e) {
        console.log("error listing files", e)
    }
    return []
}

export async function read(fileName: string) {
    console.log(`reading from ${fileName}`)
    if (useCOS()) {
        var cosContents = await readCOSFile(fileName)
        return (cosContents) ? cosContents : ""
    }
    try {
        var contents: string
        contents = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' })
        return contents
    } catch (e) {
        console.log("error reading file", e)
    }
    return ""
}

export async function write(fileName: string, contents: string) {
    console.log(`writing to ${fileName}`)
    if (useCOS()) {
        return await writeCOSFile(fileName, contents)
    }
    try {
        fs.writeFileSync(fileName, contents)
        return true
    } catch (e) {
        console.log("error writing file", e)
    }
    return false
}