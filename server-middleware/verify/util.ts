const xss = require("xss")

// converts a string to camel case
export function toCamelCase(str: string) {
    // Lower cases the string
    return str.toLowerCase()
        // Replaces any - or _ characters with a space 
        .replace(/[-_]+/g, ' ')
        // Removes any non alphanumeric characters 
        .replace(/[^\w\s]/g, '')
        // Uppercases the first character in each group immediately following a space 
        // (delimited by spaces) 
        .replace(/ (.)/g, function ($1) { return $1.toUpperCase(); })
        // Removes spaces 
        .replace(/ /g, '');
}

// trims whitespace and strips any XSS threats
export function getFieldValue(v: string) {
    return xss(v.trim())
}