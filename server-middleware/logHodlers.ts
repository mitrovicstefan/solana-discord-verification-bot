const bodyParser = require('body-parser')
const axios = require('axios')
const app = require('express')()
import { Request, Response } from 'express'
import { initializeStorage, list, read, write } from './storage/persist'
const { getParsedNftAccountsByOwner } = require('@nfteyez/sol-rayz')
const fs = require('fs')
const nacl = require('tweetnacl')
const xss = require("xss")
const { PublicKey } = require('@solana/web3.js')
const { Client, Intents } = require('discord.js')
const cron = require('node-cron')

/**
 * Configure the Discord client
 */

// Cache of discord clients available on this server
const discordClients = new Map<any, any>()
const defaultRedactedString = "content-redacted"

// Lazy load clients as required
async function getDiscordClient(projectName: any) {

  // retrieve existing config if available
  const existingClient = discordClients.get(projectName)
  if (existingClient) {
    console.log(`found existing discord client: ${projectName}`)
    return existingClient
  }

  // get the config
  var config = await getConfig(projectName)

  // Create a new client instance
  let allIntents = new Intents()
  allIntents.add(Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.GUILD_MESSAGES)
  const newClient = new Client({ intents: allIntents });

  // add the verify command
  let prefix = "!";
  let redirect_url = config.discord_redirect_url;
  newClient.on("messageCreate", (message: { content: { startsWith: (prefix: string) => boolean }, channel: any, author: any, }) => {

    // Exit and stop if the prefix is not there or if user is a bot
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    // only process !verify commands
    if (message.content.startsWith(`${prefix}verify`)) {

      // send the verification message to user
      message.channel.send(`Hi ${message.author}! Visit ${redirect_url} to gain your special NFT holder role.`);
    }
  });

  // login to the client
  newClient.login(config.discord_bot_token);

  // wait for client to be ready
  console.log("waiting for client to initialize")
  for (var i = 0; i < 10; i++) {
    if (await newClient.guilds.cache.get(config.discord_server_id)) {
      console.log("client is ready!")
      break
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // store the global config
  console.log(`adding new discord client: ${projectName}`)
  discordClients.set(projectName, newClient)
  return newClient
}

/**
 * Configure storage layer
 */
initializeStorage()


/**
 * Background jobs
 */

// ensure the Discord client is loaded for all of the configured projects. This is 
// important for clients to be initialized, so that "!verify" messages are received
// by the server and responses provided to discord users.
var cronDiscordClientRunning = false
cron.schedule('*/5 * * * *', async function () {

  // start timestamp for monitoring
  var startTimestamp = Date.now()

  try {
    // don't run if another job is already running
    if (cronDiscordClientRunning) {
      console.log("client initialization is already running")
      return
    }

    console.log("loading all projects to initialize discord clients")
    cronDiscordClientRunning = true
    var allProjects = await getAllProjects()
    console.log("retrieved projects", allProjects.length)
    for (var i = 0; i < allProjects.length; i++) {
      try {
        console.log(`initializing client: ${allProjects[i]}`)
        await getDiscordClient(allProjects[i])
      } catch (e1) {
        console.log("error loading project", e1)
      }
    }
  } catch (e2) {
    console.log("error retrieving project list", e2)
  }

  // set flag to indicate job is no longer running
  var elapsed = Date.now() - startTimestamp
  console.log(`discord client initialization completed in ${elapsed}ms`)
  cronDiscordClientRunning = false
})

// validate project holders every 30 minutes
var cronHodlerValidationRunning = false
cron.schedule('*/30 * * * *', async function () {

  // start timestamp for monitoring
  var startTimestamp = Date.now()

  try {
    // don't run if another job is already running
    if (cronHodlerValidationRunning) {
      console.log("hodler validation is already running")
      return
    }

    // load projets and validate holders 
    console.log("loading all projects for holder revalidation")
    cronHodlerValidationRunning = true
    var allProjects = await getAllProjects()
    console.log("retrieved projects", allProjects.length)
    for (var i = 0; i < allProjects.length; i++) {
      try {
        console.log(`validating project holders: ${allProjects[i]}`)
        await reloadHolders(allProjects[i])
      } catch (e1) {
        console.log("error loading project", e1)
      }
    }
  } catch (e2) {
    console.log("error retrieving project list", e2)
  }

  // set flag to indicate job is no longer running
  var elapsed = Date.now() - startTimestamp
  console.log(`holder revalidation completed in ${elapsed}ms`)
  cronHodlerValidationRunning = false
})


/**
 * Helper methods
 */

function getHodlerFilePath(name: any) {
  return `./server-middleware/hodlers-${name}.json`
}

function getConfigFilePath(name: any) {
  return `./config/prod-${name}.json`
}

function getPublicKeyFilePath(address: any) {
  return `./config/publicKey-${address}.json`
}

function getServerFilePath(serverID: any) {
  return `./config/server-${serverID}.json`
}

function getSalesFilePath(updateAuthority: any) {
  return `sales-${updateAuthority}-console.json`
}

// validates signature of a given message
function isSignatureValid(publicKeyString: string, signature: any, message: any) {
  const encodedMessage = new TextEncoder().encode(message)
  let publicKey = new PublicKey(publicKeyString).toBytes()
  const encryptedSignature = new Uint8Array(signature.data)
  return nacl.sign.detached.verify(encodedMessage, encryptedSignature, publicKey)
}

// converts a string to camel case
function toCamelCase(str: string) {
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

// retreives the current hodler list in JSON format
const getHodlerList = async (name: any) => {
  var hodlerListStr = await read(getHodlerFilePath(name))
  return JSON.parse((hodlerListStr != "") ? hodlerListStr : "[]")
}

// retrieve configuration from filesystem
async function getConfig(name: any) {
  try {
    var contents = await read(getConfigFilePath(name))
    return JSON.parse(contents)
  } catch (e) {
    console.log("error reading file", e)
  }
  return null
}

// retrieves list of all projects
async function getAllProjects() {
  var projectNames = []
  var projectIDs = await list("./config", "prod")
  for (var i = 0; i < projectIDs.length; i++) {
    var project = projectIDs[i]?.replaceAll("./", "").replaceAll("config/prod-", "").replaceAll(".json", "")
    if (project) {
      projectNames.push(project)
    }
  }
  return projectNames
}

// retrieves the token balance
const getTokenBalance = async (walletAddress: any, tokenMintAddress: any) => {
  const response = await axios({
    url: `https://api.mainnet-beta.solana.com`,
    method: "post",
    headers: { "Content-Type": "application/json" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        walletAddress,
        {
          mint: tokenMintAddress,
        },
        {
          encoding: "jsonParsed",
        },
      ],
    },
  });
  if (
    Array.isArray(response?.data?.result?.value) &&
    response?.data?.result?.value?.length > 0 &&
    response?.data?.result?.value[0]?.account?.data?.parsed?.info?.tokenAmount
      ?.amount > 0
  ) {
    return (
      Number(
        response?.data?.result?.value[0]?.account?.data?.parsed?.info
          ?.tokenAmount?.amount
      ) / 1000000
    );
  } else {
    return 0;
  }
};

// method to determine if wallet address is verified to hold resources
const isHolderVerified = async (walletAddress: string, config: any) => {
  let tokenList
  let splTokenBalance = 0

  // Parses all tokens from that public key
  try {
    tokenList = await getParsedNftAccountsByOwner({ publicAddress: walletAddress })
  } catch (e) {
    console.log("Error parsing NFTs", e)
  }

  // Basic ass way to find matched NFTs compared to the mint list ( PRs welcome <3 )
  let matched = []
  for (let item of tokenList) {
    if (item.updateAuthority === config.update_authority) {
      console.log(`hodler ${walletAddress} item ${item.mint} matches expected update authority`)
      matched.push(item)
      break
    }
  }

  // Optionally check for spl-tokens matching mint IDs if NFTs were not found
  if (matched.length == 0 && config.spl_token && config.spl_token != "") {
    try {
      splTokenBalance = await getTokenBalance(walletAddress, config.spl_token)
      console.log(`hodler ${walletAddress} spl token balance: ${splTokenBalance}`)
    } catch (e) {
      console.log("Error getting spl token balance", e)
    }
  }

  // print result and return
  var isVerified = matched.length > 0 || splTokenBalance > 0
  console.log(`hodler ${walletAddress} verification status: ${isVerified}`)
  return isVerified
}

// validates the current holders are still in good standing
const reloadHolders = async (project: any) => {

  // retrieve config and ensure it is valid
  const config = await getConfig(project)
  if (!config) {
    return 404
  }

  // only allow reload on given interval
  var reloadIntervalMillis = parseInt((process.env.RELOAD_INTERVAL_MINUTES) ? process.env.RELOAD_INTERVAL_MINUTES : "0") * 60 * 1000
  var lastReloadMillis = (config.lastReload) ? config.lastReload : 0
  var lastReloadElapsed = Date.now() - lastReloadMillis
  console.log(`last reload was ${lastReloadElapsed}ms ago`)
  if (lastReloadElapsed < reloadIntervalMillis) {
    console.log(`reload not yet required`)
    return 200
  }

  // retrieve discord client
  const client = await getDiscordClient(project)
  if (!client) {
    return 400
  }

  // iterate the hodler list
  var hodlerList = await getHodlerList(project)
  for (let n in hodlerList) {

    // remove access if no matches
    const holder = hodlerList[n]
    if (!await isHolderVerified(holder.publicKey, config)) {

      // parse the discord address to remove
      console.log(`address is no longer holding expected tokens: ${holder.publicKey}`)
      hodlerList.splice(n, 1)
      const username = holder.discordName.split('#')[0]
      const discriminator = holder.discordName.split('#')[1]

      // remove role from discord user
      const myGuild = await client.guilds.cache.get(config.discord_server_id)
      if (!myGuild) {
        console.log("error retrieving server information")
        return 500
      }
      const role = await myGuild.roles.cache.find((r: any) => r.id === config.discord_role_id)
      if (!role) {
        console.log("error retrieving role information")
        return 500
      }
      const doer = await myGuild.members.cache.find((member: any) => (member.user.username === username && member.user.discriminator === discriminator))
      if (!doer) {
        console.log("error retrieving user information")
        return 500
      }
      await doer.roles.remove(role)
    }
  }

  // update the config with current timestamp
  config.lastReload = Date.now()
  await write(getConfigFilePath(project), JSON.stringify(config))

  // update the hodler file and return successfully
  await write(getHodlerFilePath(project), JSON.stringify(hodlerList))
  return 200
}

/**
 * API endpoint implementation
 */

// Configure the middleware to parse JSON
app.use(bodyParser.json())

// Endpoint to get all hodlers - protect it if you'd like
app.get('/getProject', async (req: Request, res: Response) => {
  try {

    // use project query string value if present
    var projectName = req.query["project"]
    if (!projectName || projectName == "") {
      var userProject = JSON.parse(await read(getPublicKeyFilePath(req.query["publicKey"])))
      projectName = userProject.projectName
    }

    // retrieve project config
    var config = await getConfig(projectName)
    if (!config) {
      return res.sendStatus(404)
    }

    // remove sensitive data
    var returnConfig = {
      project: projectName,
      project_friendly_name: config.project_friendly_name,
      is_holder: config.is_holder,
      discord_client_id: config.discord_client_id,
      discord_server_id: config.discord_server_id,
      discord_role_id: config.discord_role_id,
      discord_redirect_url: config.discord_redirect_url,
      update_authority: config.update_authority,
      spl_token: config.spl_token,
      royalty_wallet_id: config.royalty_wallet_id,
      verifications: config.verifications,
      message: config.message,
      discord_bot_token: defaultRedactedString
    }

    // return the configuration
    return res.json(returnConfig)
  } catch (e) {
    console.log("error retrieving project", e)
    return res.sendStatus(404)
  }
})

// Endpoint to get all hodlers - protect it if you'd like
app.get('/getProjectSales', async (req: Request, res: Response) => {
  try {
    var config = await getConfig(req.query["project"])
    if (!config) {
      return res.sendStatus(404)
    }
    return res.json(JSON.parse(await read(getSalesFilePath(config.update_authority))))
  } catch (e) {
    console.log("error querying project sales", e)
    return res.json([])
  }
})

app.get('/getProjects', async (req: Request, res: Response) => {
  try {
    var projectNames: any[] = []
    for (const project of discordClients.keys()) {
      var config = await getConfig(project)
      projectNames.push({
        project: project,
        is_holder: config.is_holder,
        verifications: config.verifications
      })
    }
    res.json(projectNames)
  } catch (e) {
    return res.sendStatus(404)
  }
})

// Endpoint to validate a hodler and add role 
app.post('/createProject', async (req: Request, res: Response) => {

  // Validates signature sent from client
  var publicKeyString = req.body.publicKey
  if (!isSignatureValid(publicKeyString, req.body.signature, process.env.MESSAGE)) {
    return res.sendStatus(400)
  }

  // validate user does not own a project already
  try {
    var userProject = JSON.parse(await read(getPublicKeyFilePath(req.body.publicKey)))
    if (userProject && userProject.projectName != "") {
      console.log(`address ${req.body.publicKey} already owns project ${userProject.projectName}`)
      return res.sendStatus(403)
    }
  } catch (e) {
    console.log("error retreiving existing project", e)
  }

  // validate the server ID is not already in use
  try {
    var serverFile = JSON.parse(await read(getServerFilePath(req.body.discord_server_id)))
    if (serverFile && serverFile.projectName != "") {
      console.log(`server ${req.body.discord_server_id} already associated with project ${serverFile.projectName}`)
      return res.sendStatus(409)
    }
  } catch (e) {
    console.log("error looking up existing server", e)
  }

  // ensure we have a proper project name
  var projectNameCamel = toCamelCase(xss(req.body.project))

  // validate project name does not already exist
  const config = await getConfig(projectNameCamel)
  if (config) {
    console.log(`project already exists: ${projectNameCamel}`)
    return res.sendStatus(409)
  }

  // Is the address a system level token holder?
  var isHolder = await isHolderVerified(publicKeyString, {
    update_authority: process.env.UPDATE_AUTHORITY,
    spl_token: process.env.SPL_TOKEN
  })

  // validation of required fields
  var validationFailures: any[] = []
  var validateRequired = (k: string, v: string) => {
    if (v == "") {
      validationFailures.push({
        "field": k,
        "error": "field is required"
      })
    }
    return v
  }

  // create and validate the new project configuration
  var newProjectConfig = {
    owner_public_key: publicKeyString,
    is_holder: isHolder,
    project_friendly_name: xss(req.body.project),
    message: `Verify ${xss(req.body.project)} Discord roles`,
    discord_client_id: validateRequired("discord_client_id", xss(req.body.discord_client_id)),
    discord_server_id: validateRequired("discord_server_id", xss(req.body.discord_server_id)),
    discord_role_id: validateRequired("discord_role_id", xss(req.body.discord_role_id)),
    discord_redirect_url: `${process.env.BASE_URL}/${projectNameCamel}`,
    discord_bot_token: validateRequired("discord_bot_token", xss(req.body.discord_bot_token)),
    update_authority: validateRequired("update_authority", xss(req.body.update_authority)),
    royalty_wallet_id: xss(req.body.royalty_wallet_id),
    spl_token: xss(req.body.spl_token),
    verifications: 0
  }
  if (validationFailures.length > 0) {
    console.log("invalid request:", JSON.stringify(validationFailures))
    return res.sendStatus(400)
  }
  var isSuccessful = await write(getConfigFilePath(projectNameCamel), JSON.stringify(newProjectConfig))
  if (!isSuccessful) {
    return res.sendStatus(500)
  }

  // create mapping of wallet public key to project name
  isSuccessful = await write(getPublicKeyFilePath(publicKeyString), JSON.stringify({
    projectName: projectNameCamel
  }))
  if (!isSuccessful) {
    return res.sendStatus(500)
  }

  // create mapping of discord servier id to project name
  isSuccessful = await write(getServerFilePath(newProjectConfig.discord_server_id), JSON.stringify({
    projectName: projectNameCamel
  }))
  if (!isSuccessful) {
    return res.sendStatus(500)
  }

  // save and return
  console.log(`successfully created project ${projectNameCamel} for owner ${publicKeyString}`)
  return res.json(newProjectConfig)
})

// Endpoint to validate a hodler and add role 
app.post('/updateProject', async (req: Request, res: Response) => {

  // Validates signature sent from client
  var publicKeyString = req.body.publicKey
  if (!isSignatureValid(publicKeyString, req.body.signature, process.env.MESSAGE)) {
    return res.sendStatus(400)
  }

  // validate user owns the project
  try {
    var userProject = JSON.parse(await read(getPublicKeyFilePath(req.body.publicKey)))
    if (userProject && userProject.projectName != req.body.project) {
      console.log(`address ${req.body.publicKey} does not own ${req.body.project}`)
      return res.sendStatus(401)
    }
  } catch (e) {
    console.log("user does not own project", e)
    return res.sendStatus(401)
  }

  // validate project name does not already exist
  const config = await getConfig(req.body.project)
  if (!config) {
    console.log(`project does not exist: ${req.body.project}`)
    return res.sendStatus(404)
  }

  // Is the address a system level token holder?
  var isHolder = await isHolderVerified(publicKeyString, {
    update_authority: process.env.UPDATE_AUTHORITY,
    spl_token: process.env.SPL_TOKEN
  })

  // update values that have been modified
  config.is_holder = isHolder
  if (req.body.discord_client_id) {
    config.discord_client_id = xss(req.body.discord_client_id)
  }
  if (req.body.discord_server_id) {
    config.discord_server_id = xss(req.body.discord_server_id)
  }
  if (req.body.discord_role_id) {
    config.discord_role_id = xss(req.body.discord_role_id)
  }
  if (req.body.discord_bot_token && req.body.discord_bot_token != defaultRedactedString) {
    config.discord_bot_token = xss(req.body.discord_bot_token)
  }
  if (req.body.update_authority) {
    config.update_authority = xss(req.body.update_authority)
  }
  if (req.body.project_friendly_name) {
    config.project_friendly_name = xss(req.body.project_friendly_name)
  }
  if (req.body.royalty_wallet_id) {
    config.royalty_wallet_id = xss(req.body.royalty_wallet_id)
  }
  if (req.body.spl_token) {
    config.spl_token = xss(req.body.spl_token)
  }

  // write updated config
  var isSuccessful = await write(getConfigFilePath(req.body.project), JSON.stringify(config))
  if (!isSuccessful) {
    return res.sendStatus(500)
  }

  // save and return
  console.log(`successfully updated project ${req.body.project} for owner ${publicKeyString}`)
  return res.json(config)
})

// Endpoint to validate a hodler and add role 
app.post('/logHodlers', async (req: Request, res: Response) => {

  // retrieve config and ensure it is valid
  const config = await getConfig(req.body.projectName)
  if (!config) {
    return res.sendStatus(404)
  }

  // validate free tier not over verification limit
  var maxFreeVerifications = parseInt((process.env.MAX_FREE_VERIFICATIONS) ? process.env.MAX_FREE_VERIFICATIONS : "-1")
  if (!config.is_holder && maxFreeVerifications > 0) {
    if (config.verifications > maxFreeVerifications) {
      console.log(`free verifications for ${req.body.projectName} has been reached (${config.verifications})`)
      return res.sendStatus(403)
    }
  }

  // Validates signature sent from client
  var publicKeyString = req.body.publicKey
  if (!isSignatureValid(publicKeyString, req.body.signature, config.message)) {
    return res.sendStatus(400)
  }

  // store the discord name from the body
  const discordName = req.body.discordName

  // If matched NFTs are not empty and it's not already in the JSON push it
  var updatedConfig = false
  if (await isHolderVerified(publicKeyString, config)) {
    let hasHodler = false
    var hodlerList = await getHodlerList(req.body.projectName)
    for (let n of hodlerList) {
      if (n.discordName === discordName) hasHodler = true
    }
    if (!hasHodler) {
      console.log("adding to hodler list: " + publicKeyString)
      hodlerList.push({
        discordName: discordName,
        publicKey: publicKeyString
      })

      // increment verification count
      var count = (config.verifications) ? config.verifications : 0
      config.verifications = ++count
      updatedConfig = true
    }
  } else {
    console.log("user not verified: " + publicKeyString)
    return res.sendStatus(401)
  }

  const username = discordName.split('#')[0]
  const discriminator = discordName.split('#')[1]
  const client = await getDiscordClient(req.body.projectName)
  if (!client) {
    return res.sendStatus(404)
  }

  // Update role
  const myGuild = await client.guilds.cache.get(config.discord_server_id)
  if (!myGuild) {
    console.log("error retrieving server information")
    return res.sendStatus(500)
  }
  const role = await myGuild.roles.cache.find((r: any) => r.id === config.discord_role_id)
  if (!role) {
    console.log("error retrieving role information")
    return res.sendStatus(500)
  }
  const doer = await myGuild.members.cache.find((member: any) => (member.user.username === username && member.user.discriminator === discriminator))
  if (!doer) {
    console.log("error retrieving user information")
    return res.sendStatus(500)
  }
  await doer.roles.add(role)
  console.log("successfully added user role")

  // write the config if updated
  if (updatedConfig) {
    await write(getConfigFilePath(req.body.projectName), JSON.stringify(config))
  }

  // write result and return successfully
  await write(getHodlerFilePath(req.body.projectName), JSON.stringify(hodlerList))
  res.sendStatus(200)
})

// Endpoint to get all hodlers - protect it if you'd like
app.get('/getHodlers', async (req: Request, res: Response) => {
  var config = await getConfig(req.query["project"])
  if (config) {
    return res.json(await getHodlerList(req.query["project"]))
  }
  return res.sendStatus(404)
})

// Endpoint to validate current hodlers
app.get('/reloadHolders', async (req: Request, res: Response) => {
  res.sendStatus(await reloadHolders(req.query["project"]))
})

// export the app
module.exports = app
