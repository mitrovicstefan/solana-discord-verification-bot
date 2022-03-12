const bodyParser = require('body-parser')
const axios = require('axios')
const app = require('express')()
const { base58_to_binary } = require('base58-js')
import { Request, Response } from 'express'
import morganMiddleware from './logger/morgan'
import { initializeStorage, list, read, write } from './storage/persist'
const { getParsedNftAccountsByOwner } = require('@nfteyez/sol-rayz')
const nacl = require('tweetnacl')
const xss = require("xss")
const { PublicKey } = require('@solana/web3.js')
const { Client, Intents } = require('discord.js')
const cron = require('node-cron')
const loggerWithLabel = require('./logger/structured')

/**
 * Configure logging
 */
const logger = loggerWithLabel("logHodlers")

/**
 * Create HTTP client with 60 second timeout
 */
const defaultHttpTimeout = 60000

/**
 * Configure session management for select endpoints
 */
const sessionMiddleware = require('express-session')({
  secret: process.env.TWITTER_SESSION_SECRET,
  name: "verification.sid",
  resave: true,
  saveUninitialized: true,
  cookie: {
    secure: 'auto',
  },
})

/**
 * Configure the Discord clients
 */

// Cache of discord clients available on this server
const discordClients = new Map<any, any>()
const defaultRedactedString = "content-redacted"

// Lazy load clients as required
async function getDiscordClient(projectName: any) {

  // retrieve existing config if available
  const existingClient = discordClients.get(projectName)
  if (existingClient) {
    logger.info(`found existing discord client: ${projectName}`)
    return existingClient
  }

  // get the config
  var config = await getConfig(projectName)

  // create a new client instance
  let allIntents = new Intents()
  allIntents.add(Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.GUILD_MESSAGES)
  const newClient = new Client({ intents: allIntents });

  // listen for bot commands if enabled
  if (process.env.ENABLE_BOT_COMMANDS) {
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
  }

  try {
    // login to the client
    newClient.login(config.discord_bot_token);

    // wait for client to be ready
    logger.info(`waiting for ${projectName} client to initialize`)
    for (var i = 0; i < 10; i++) {
      if (await newClient.guilds.cache.get(config.discord_server_id)) {
        logger.info(`${projectName} client is ready!`)

        // store the global config
        logger.info(`adding new discord client: ${projectName}`)
        discordClients.set(projectName, newClient)
        return newClient
      }
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {
    logger.info(`error logging into ${projectName} client`, e)
  }

  // getting here means an error
  logger.info(`client ${projectName} was not initialized`)
  return null
}

// Query project list and retrieve all discord clients
async function getAllDiscordClients() {
  logger.info("loading all projects to initialize discord clients")
  try {
    cronDiscordClientRunning = true
    var allProjects = await getAllProjects()
    logger.info("retrieved projects", allProjects.length)
    for (var i = 0; i < allProjects.length; i++) {
      try {
        logger.info(`initializing client: ${allProjects[i]}`)
        await getDiscordClient(allProjects[i])
      } catch (e1) {
        logger.info(`error loading client for project ${allProjects[i]}`, e1)
      }
    }
  } catch (e) {
    logger.info("error retrieving projects", e)
  }
  cronDiscordClientRunning = false
}

// batch mode for revalidation
if (process.env.REVALIDATION_MODE == "true") {
  const revalidate = async function () {

    // wait for startup prereqs
    initializeStorage()
    await getAllDiscordClients()

    // start timestamp for monitoring
    var startTimestamp = Date.now()

    try {

      // concurrency control
      var maxConcurrent = 1
      var promises = []

      // load projets and validate holders 
      logger.info("loading all projects for holder revalidation")
      var allProjects = await getAllProjects()
      logger.info("retrieved projects", allProjects.length)
      for (var i = 0; i < allProjects.length; i++) {

        // schedule to the concurrent queue
        promises.push(async function () {
          try {
            logger.info(`validating project holders: ${allProjects[i]}`)
            await reloadHolders(allProjects[i])
          } catch (e1) {
            logger.info(`error reloading project ${allProjects[i]}`, e1)
          }
        }())

        // throttle concurrency
        if (promises.length == maxConcurrent) {
          logger.info(`waiting for ${promises.length} projects to complete`)
          await Promise.all(promises)
          promises = []
        }
      }

      // wait for queue to complete
      logger.info(`waiting for ${promises.length} remaining projects to complete`)
      await Promise.all(promises)
    } catch (e2) {
      logger.info("error retrieving project list", e2)
    }

    // exit the program
    var elapsed = Date.now() - startTimestamp
    logger.info(`holder revalidation completed in ${elapsed}ms`)
    await write(getRevalidationSuccessPath(), Date.now().toString())
    process.exit(0)
  }

  // execute the batch revalidation
  revalidate()

} else {

  /**
   * Configure storage layer
   */
  initializeStorage()

  /**
   * Retrieve discord clients at server startup
   */
  getAllDiscordClients()

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
        logger.info("client initialization is already running")
        return
      }
      await getAllDiscordClients()
    } catch (e2) {
      logger.info("error retrieving project list", e2)
    }

    // set flag to indicate job is no longer running
    var elapsed = Date.now() - startTimestamp
    logger.info(`discord client initialization completed in ${elapsed}ms`)
    cronDiscordClientRunning = false
  })
}

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

function getSalesFilePath(updateAuthority: any) {
  return `sales-${updateAuthority}-console.json`
}

function getSalesTrackerLockPath() {
  return "sales-tracker-running"
}

function getSalesTrackerSuccessPath() {
  return "sales-tracker-success"
}

function getRevalidationSuccessPath() {
  return "revalidation-success"
}

// trims whitespace and strips any XSS threats
function getFieldValue(v: string) {
  return xss(v.trim())
}

// validates signature of a given message
function isSignatureValid(publicKeyString: string, signature: any, message: any) {
  logger.info(`validating signagure ${signature} for public key ${publicKeyString}`)
  const encodedMessage = new TextEncoder().encode(message)
  let publicKey = new PublicKey(publicKeyString).toBytes()
  const encryptedSignature = base58_to_binary(signature)
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
    logger.info("error reading file", e)
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
    timeout: defaultHttpTimeout,
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

const getTokenAttributes = async (uri: any) => {
  try {
    const response = await axios({
      url: uri,
      method: "get",
      timeout: defaultHttpTimeout,
    })
    return response.data.attributes
  } catch (e) {
    logger.info(`error getting token attributes on ${uri}`, e)
  }
  return [{ "trait_type": "trait_type_default", "value": "trait_type_value" }]
}

// determines the list of roles required by a project
const getRequiredRoles = async (config: any) => {

  // default NFT balance role
  var nftAttributes: any[] = []
  var projectRoles = []
  projectRoles.push({
    roleID: config.discord_role_id,
    splBalance: 0,
    nftBalance: 1,
    nftAttributes: nftAttributes
  })

  // default SPL token balance role
  projectRoles.push({
    roleID: config.discord_role_id,
    splBalance: 1,
    nftBalance: 0,
    nftAttributes: nftAttributes
  })

  // holder only access to trait based role assignment
  if (config.is_holder && config.roles) {
    config.roles.forEach((role: any) => {
      projectRoles.push({
        roleID: role.discord_role_id,
        splBalance: 0,
        nftBalance: role.required_balance,
        nftAttributes: [{
          key: role.key,
          value: role.value
        }]
      })
    })
  }

  logger.info(`required roles are ${JSON.stringify(projectRoles)}`)
  return projectRoles
}

// determines if the holder is verified
const getHodlerRoles = async (walletAddress: string, config: any) => {

  // retrieve the required roles for this project
  var startTime = Date.now()
  var projectRoles = await getRequiredRoles(config)
  var userRoleMap = new Map<any, boolean>()
  logger.info(`checking wallet ${walletAddress} roles against project roles ${JSON.stringify(projectRoles)}`)

  // determine if the wallet is valid for each role
  var wallet = await getHodlerWallet(walletAddress, config)
  for (var i = 0; i < projectRoles.length; i++) {

    // asssume not verified until determined otherwise
    var projectRole = projectRoles[i]
    var roleVerified = false

    // validate on SPL balance if specified
    if (projectRole.splBalance > 0) {
      var splBalance = wallet.splBalance || 0
      if (splBalance >= projectRole.splBalance) {
        logger.info(`wallet ${walletAddress} validated for role ${projectRole.roleID} via SPL balance`)
        roleVerified = true
      }
    }

    // if present, determine the number of NFTs match the required attributes
    if (projectRole.nftBalance > 0 && wallet.nfts) {
      var walletNFTCount = wallet.nfts.length
      var matchingNFTCount = walletNFTCount
      if (projectRole.nftAttributes.length > 0) {
        matchingNFTCount = 0
        projectRole.nftAttributes.forEach(requiredAttribute => {
          for (var j = 0; j < walletNFTCount; j++) {
            var walletNFT = (wallet.nfts) ? wallet.nfts[j] : undefined
            logger.info(`checking wallet ${walletAddress} NFT ${JSON.stringify(walletNFT)} for required attribute ${JSON.stringify(requiredAttribute)}`)
            if (walletNFT?.attributes) {
              for (var k = 0; k < walletNFT.attributes.length; k++) {
                var walletNFTAttribute = walletNFT.attributes[k]
                if ([walletNFTAttribute.trait_type, "*"].includes(requiredAttribute.key)) {
                  if ([walletNFTAttribute.value, "*"].includes(requiredAttribute.value)) {
                    logger.info(`wallet ${walletAddress} matches requirement ${JSON.stringify(requiredAttribute)}`)
                    matchingNFTCount++
                    break
                  }
                }
              }
            }
          }
        })
      }

      // verify the required number of NFT matches has been met
      if (matchingNFTCount >= projectRole.nftBalance) {
        logger.info(`wallet ${walletAddress} validated for role ${projectRole.roleID} via matching NFT count. Required=${projectRole.nftBalance}, found=${matchingNFTCount}`)
        roleVerified = true
      }
    }

    // set the role verification result
    if (!userRoleMap.get(projectRole.roleID)) {
      userRoleMap.set(projectRole.roleID, roleVerified)
    }
  }

  // create a list of only validated role IDs
  var userRoles = []
  for (const roleID of userRoleMap.keys()) {
    if (userRoleMap.get(roleID)) {
      userRoles.push(roleID)
    }
  }
  var elapsedTime = Date.now() - startTime
  logger.info(`wallet ${walletAddress} has roles ${JSON.stringify(userRoles)} (${elapsedTime}ms)`)
  return userRoles
}

// method to sleep for N seconds
function sleep(n: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, n * 1000);
  });
}

// choose a random number between two values
function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

// inspects a holder's wallet for NFTs and SPL tokens matching the criteria
// specified in the config map
const getHodlerWallet = async (walletAddress: string, config: any) => {

  // initialize an empty wallet to be returned
  let nfts: any[] = [];
  let wallet = {
    nfts: nfts,
    splBalance: 0
  }

  // Parses all tokens from the requested wallet address public key
  let tokenList
  var maxRetries = 10
  for (var i = 0; i < maxRetries; i++) {
    try {
      tokenList = await getParsedNftAccountsByOwner({ publicAddress: walletAddress })
      break
    } catch (e) {
      var retryNumber = i + 1
      if (retryNumber >= maxRetries) {
        logger.info(`wallet ${walletAddress} failed to load after ${retryNumber} retries`)
        throw e
      }
      var backoffSeconds = retryNumber * randomIntFromInterval(1, 5)
      logger.info(`error retrieving wallet ${walletAddress}, retry ${retryNumber} in ${backoffSeconds} seconds`, e)
      await sleep(backoffSeconds)
    }
  }

  // determine list of valid update authorities
  var updateAuthorityList = [config.update_authority]
  var splTokenList: any[] = []
  if (config.spl_token) {
    splTokenList = config.spl_token.split(",")
    splTokenList.forEach((ua: any) => {
      updateAuthorityList.push(ua)
    })
  }

  // populate the items in the wallet
  if (tokenList) {

    // concurrency control
    var maxConcurrent = 25
    var promises = []

    // iterate the available tokens for this wallet
    for (let item of tokenList) {
      if (updateAuthorityList.includes(item.updateAuthority)) {

        // schedule to the concurrent queue
        promises.push(async function () {
          logger.info(`wallet ${walletAddress} item ${item.mint} matches an expected update authority (${JSON.stringify(updateAuthorityList)})`)
          if (config.roles && config.roles.length > 0 && config.is_holder) {
            logger.info(`wallet ${walletAddress} retrieving token metadata for ${item.mint}`)
            item.attributes = await getTokenAttributes(item.data.uri)
          } else {
            logger.info(`skipping wallet ${walletAddress} token metadata for ${item.mint}`)
          }
          logger.info(`wallet ${walletAddress} adding item to wallet ${JSON.stringify(item)}`)
          wallet.nfts.push(item)
        }())

        // throttle concurrency
        if (promises.length == maxConcurrent) {
          logger.info(`wallet ${walletAddress} waiting for ${promises.length} NFTs to complete processing`)
          await Promise.all(promises)
          promises = []
        }
      }
    }

    // wait for queue to complete
    logger.info(`wallet ${walletAddress} waiting for ${promises.length} remaining NFTs to complete processing`)
    await Promise.all(promises)
  }

  // if specified in the config, check for SPL token balance
  if (splTokenList) {
    for (var i = 0; i < splTokenList.length; i++) {
      try {
        wallet.splBalance = await getTokenBalance(walletAddress, splTokenList[i])
        logger.info(`wallet ${walletAddress} spl token ${splTokenList[i]} balance: ${wallet.splBalance}`)
      } catch (e) {
        logger.info("Error getting spl token balance", e)
      }
    }
  }

  // return the wallet object
  return wallet
}

// validates the current holders are still in good standing
const reloadHolders = async (project: any) => {

  // raed only made flag to log destructive changes but not write them
  var readOnly = process.env.DISABLE_REMOVE_ROLES == "true"
  if (readOnly) {
    logger.info(`reloading project ${project} in read-only mode`)
  } else {
    logger.info(`reloading project ${project} in write mode`)
  }

  // retrieve config and ensure it is valid
  const config = await getConfig(project)
  if (!config) {
    return 404
  }

  // only allow reload on given interval
  var reloadIntervalMillis = parseInt((process.env.RELOAD_INTERVAL_MINUTES) ? process.env.RELOAD_INTERVAL_MINUTES : "0") * 60 * 1000
  var lastReloadMillis = (config.lastReload) ? config.lastReload : 0
  var lastReloadElapsed = Date.now() - lastReloadMillis
  logger.info(`last reload was ${lastReloadElapsed}ms ago`)
  if (lastReloadElapsed < reloadIntervalMillis) {
    logger.info(`reload not yet required`)
    return 200
  }

  // retrieve discord client
  var startTime = Date.now()
  const client = await getDiscordClient(project)
  if (!client) {
    return 400
  }

  // some general statistics
  var metrics = {
    added: 0,
    removed: 0,
    unchanged: 0,
    error: 0
  }

  // iterate the hodler list
  var updatedHodlerList: any[] = []
  var hodlerList = await getHodlerList(project)
  for (let n in hodlerList) {

    // the holder to revalidate
    const holder = hodlerList[n]

    try {

      // determine currently held roles
      var verifiedRoles = await getHodlerRoles(holder.publicKey, config)

      // determine roles to add
      var rolesToAdd: any[] = []
      verifiedRoles.forEach(verifiedRole => {
        var foundRole = false
        if (holder.roles) {
          holder.roles.forEach((holderRole: any) => {
            if (holderRole == verifiedRole) {
              foundRole = true
            }
          })
        }
        if (!foundRole) {
          rolesToAdd.push(verifiedRole)
        }
      })

      // determine roles to remove
      var rolesToRemove: any[] = []
      if (holder.roles) {
        holder.roles.forEach((holderRole: any) => {
          var foundRole = false
          verifiedRoles.forEach(verifiedRole => {
            if (holderRole == verifiedRole) {
              foundRole = true
            }
          })
          if (!foundRole) {
            rolesToRemove.push(holderRole)
          }
        })
      }

      // update the user's roles
      if (rolesToAdd.length > 0 || rolesToRemove.length > 0) {

        // audit log for what changes are going to be made
        logger.info(`holder ${JSON.stringify(holder)} updating roles, add=${JSON.stringify(rolesToAdd)}, remove=${JSON.stringify(rolesToRemove)}`)

        // parse the discord address to remove
        hodlerList.splice(n, 1)
        const username = holder.discordName.split('#')[0]
        const discriminator = holder.discordName.split('#')[1]

        // retrieve server and user records from discord
        const myGuild = await client.guilds.cache.get(config.discord_server_id)
        if (!myGuild) {
          logger.info(`holder ${JSON.stringify(holder)} error retrieving server information`)
          continue
        }
        const doer = await myGuild.members.cache.find((member: any) => (member.user.username === username && member.user.discriminator === discriminator))
        if (!doer) {
          logger.info(`holder ${JSON.stringify(holder)} error retrieving user information`)
          continue
        }

        // remove the roles that are no longer valid
        for (var i = 0; i < rolesToRemove.length; i++) {
          const role = await myGuild.roles.cache.find((r: any) => r.id === rolesToRemove[i])
          if (!role) {
            logger.info(`holder ${JSON.stringify(holder)} error retrieving role information ${JSON.stringify(rolesToRemove[i])}`)
            continue
          }
          logger.info(`holder ${JSON.stringify(holder)} removing role ${rolesToRemove[i]} on server ${config.discord_server_id}`)
          if (!readOnly) {
            await doer.roles.remove(role)
          }
          metrics.removed++
        }

        // add the roles that are missing
        for (var i = 0; i < rolesToAdd.length; i++) {
          const role = await myGuild.roles.cache.find((r: any) => r.id === rolesToAdd[i])
          if (!role) {
            logger.info(`holder ${JSON.stringify(holder)} error retrieving role information`)
            continue
          }
          logger.info(`holder ${JSON.stringify(holder)} adding role ${rolesToAdd[i]} on server ${config.discord_server_id}`)
          await doer.roles.add(role)
          metrics.added++
        }
      } else {
        // no changes required for this user
        logger.info(`no changes required for holder ${JSON.stringify(holder)} revalidation `)
        metrics.unchanged++
      }

      // update the holder list to include only the verified roles. If there are not any
      // verified roles then do not include the holder in the updated list at all.
      if (verifiedRoles.length > 0) {
        logger.info(`updating holder list with user ${JSON.stringify(holder)} with verified roles ${JSON.stringify(verifiedRoles)}`)
        holder.roles = verifiedRoles
        updatedHodlerList.push(holder)
      } else {
        logger.info(`holder no longer has any roles ${JSON.stringify(holder)}`)
      }
    } catch (holderErr) {
      logger.info(`error revalidating holder ${JSON.stringify(holder)}`, holderErr)
      metrics.error++
    }
  }

  // update the config with current timestamp
  config.lastReload = Date.now()
  await write(getConfigFilePath(project), JSON.stringify(config))

  // update the hodler file and return successfully
  if (!readOnly) {
    logger.info(`updating ${project} holder list with ${updatedHodlerList.length} users`)
    await write(getHodlerFilePath(project), JSON.stringify(updatedHodlerList))
  }

  // write elapsed time and continue
  var reloadElapsed = Date.now() - startTime
  logger.info(`reloaded roles for ${project} in ${reloadElapsed}ms with results ${JSON.stringify(metrics)}`)
  return 200
}

/**
 * API endpoint implementation
 */

// Configure the middleware to parse JSON
app.use(bodyParser.json())
app.use(morganMiddleware)

// Endpoint to retrieve a previously connected wallet session
app.get('/getConnectedWallet', sessionMiddleware, (req: any, res: Response) => {
  if (req.session) {
    if (req.session.publicKey && req.session.signature) {
      logger.info(`found connected wallet address ${req.session.publicKey}`)
      return res.json({
        publicKey: req.session.publicKey,
        signature: req.session.signature
      })
    }
  }
  return res.sendStatus(401)
})

// Endpoint to disconnect a wallet from session
app.get('/disconnectWallet', sessionMiddleware, (req: any, res: Response) => {
  if (req.session) {
    logger.info(`disonnecting wallet address ${req.session.publicKey}`)
    req.session.destroy(function (err: any) {
      if (err) {
        logger.info("unable to disconnect session", err)
      }
    })
  }
  return res.sendStatus(200)
})

// Endpoint to connect a wallet to session
app.post('/connectWallet', sessionMiddleware, (req: any, res: Response) => {

  // Validates signature sent from client
  var publicKeyString = req.body.publicKey
  logger.info(`connecting wallet with public key ${publicKeyString} signature ${req.body.signature}`)
  if (!isSignatureValid(publicKeyString, req.body.signature, process.env.MESSAGE)) {
    logger.info(`signature invalid for public key ${publicKeyString}`)
    return res.sendStatus(400)
  }

  // save in session
  if (req.session) {
    logger.info(`connecting wallet with key ${publicKeyString}`)
    req.session.publicKey = publicKeyString
    req.session.signature = req.body.signature
  }
  return res.sendStatus(200)
})

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
      project_twitter_name: config.project_twitter_name,
      project_website: config.project_website,
      is_holder: config.is_holder,
      discord_url: config.discord_url,
      discord_client_id: config.discord_client_id,
      discord_server_id: config.discord_server_id,
      discord_role_id: config.discord_role_id,
      discord_roles: config.roles,
      discord_redirect_url: config.discord_redirect_url,
      update_authority: config.update_authority,
      spl_token: config.spl_token,
      royalty_wallet_id: config.royalty_wallet_id,
      verifications: config.verifications,
      message: config.message,
      discord_webhook: defaultRedactedString,
      discord_bot_token: defaultRedactedString,
      connected_twitter_name: config.connected_twitter_name
    }

    // return the configuration
    return res.json(returnConfig)
  } catch (e) {
    logger.info("error retrieving project", e)
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
    logger.info("error querying project sales", e)
    return res.json([])
  }
})

app.get('/getProjects', async (req: Request, res: Response) => {

  var projectData: any[] = []
  var aggregateData: any = {
    projects: {
      active: 0,
      all: discordClients.size,
      holder: 0
    },
    sales: 0,
    verifications: 0,
    tracker: {
      inProgress: 0,
      lastSuccess: 0,
    },
    revalidation: {
      lastSuccess: 0
    }
  }
  for (const project of discordClients.keys()) {
    try {

      // get config and skip if not yet any verifications
      var config = await getConfig(project)
      if (!req.query["all"] && config.verifications < 2) {
        continue
      }

      // print the data and aggregate
      var data = {
        project: project,
        project_friendly_name: config.project_friendly_name,
        project_thumbnail: config.project_thumbnail,
        project_twitter_name: config.project_twitter_name,
        project_website: config.project_website,
        discord_url: config.discord_url,
        connected_twitter_name: config.connected_twitter_name,
        is_holder: config.is_holder,
        verifications: config.verifications,
        sales: (config.sales) ? config.sales : 0
      }
      projectData.push(data)
      if (config.is_holder) {
        aggregateData.projects.holder++
      }
      aggregateData.projects.active++
      aggregateData.verifications += data.verifications
      aggregateData.sales += data.sales
    } catch (e) {
      logger.info("error rendering project", e)
    }
  }

  // sort project data by sales and verifications
  projectData.sort((a: any, b: any) => (a.verifications + a.sales < b.verifications + b.sales) ? 1 : ((b.verifications + b.sales < a.verifications + a.sales) ? -1 : 0))

  // retrieve the elapsed time since last sales query
  var lockFileContents = await read(getSalesTrackerLockPath())
  if (lockFileContents && lockFileContents != "") {
    var elapsedCurrentRun = (Date.now() - new Date(parseInt(lockFileContents)).getTime()) / 1000
    aggregateData.tracker.inProgress = elapsedCurrentRun
  }

  // retrieve the elapsed time since last sales query
  var successFileContents = await read(getSalesTrackerSuccessPath())
  if (successFileContents && successFileContents != "") {
    var elapsedSinceLastRun = (Date.now() - new Date(parseInt(successFileContents)).getTime()) / 1000
    aggregateData.tracker.lastSuccess = elapsedSinceLastRun
  }

  // retrieve the elapsed time since last revalidation success
  var revalidationFileContents = await read(getRevalidationSuccessPath())
  if (revalidationFileContents && revalidationFileContents != "") {
    var elapsedSinceLastRun = (Date.now() - new Date(parseInt(revalidationFileContents)).getTime()) / 1000
    aggregateData.revalidation.lastSuccess = elapsedSinceLastRun
  }

  // return the data
  res.json({
    metrics: aggregateData,
    projects: projectData
  })
})

// Endpoint to validate a hodler and add role 
app.post('/createProject', async (req: any, res: Response) => {

  // Validates signature sent from client
  var publicKeyString = req.body.publicKey
  if (!isSignatureValid(publicKeyString, req.body.signature, process.env.MESSAGE)) {
    logger.info(`signature invalid for public key ${publicKeyString}`)
    return res.sendStatus(400)
  }

  // validate user does not own a project already
  try {
    var userProject = JSON.parse(await read(getPublicKeyFilePath(req.body.publicKey)))
    if (userProject && userProject.projectName != "") {
      logger.info(`address ${req.body.publicKey} already owns project ${userProject.projectName}`)
      return res.sendStatus(403)
    }
  } catch (e) {
    logger.info("error retreiving existing project", e)
  }

  // ensure we have a proper project name
  var projectNameCamel = toCamelCase(getFieldValue(req.body.project))

  // validate project name does not already exist
  const config = await getConfig(projectNameCamel)
  if (config) {
    logger.info(`project already exists: ${projectNameCamel}`)
    return res.sendStatus(409)
  }

  // Is the address a system level token holder?
  var holderRoles = await getHodlerRoles(publicKeyString, {
    discord_role_id: "project-verified",
    update_authority: process.env.UPDATE_AUTHORITY,
    spl_token: process.env.SPL_TOKEN
  })
  var isHolder = holderRoles.length > 0


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
  var roles: any[] = []
  var newProjectConfig = {
    owner_public_key: publicKeyString,
    is_holder: isHolder,
    project_friendly_name: getFieldValue(req.body.project),
    project_twitter_name: getFieldValue(req.body.project_twitter_name),
    project_website: getFieldValue(req.body.project_website),
    message: `Verify ${getFieldValue(req.body.project)} Discord roles`,
    discord_url: getFieldValue(req.body.discord_url),
    discord_client_id: validateRequired("discord_client_id", getFieldValue(req.body.discord_client_id)),
    discord_server_id: validateRequired("discord_server_id", getFieldValue(req.body.discord_server_id)),
    discord_role_id: validateRequired("discord_role_id", getFieldValue(req.body.discord_role_id)),
    discord_redirect_url: `${process.env.BASE_URL}/${projectNameCamel}`,
    discord_bot_token: validateRequired("discord_bot_token", getFieldValue(req.body.discord_bot_token)),
    discord_webhook: getFieldValue(req.body.discord_webhook),
    update_authority: validateRequired("update_authority", getFieldValue(req.body.update_authority)),
    royalty_wallet_id: getFieldValue(req.body.royalty_wallet_id),
    spl_token: getFieldValue(req.body.spl_token),
    roles: roles,
    verifications: 0
  }
  if (req.body.discord_roles) {
    var roles: any[] = []
    req.body.discord_roles.forEach((role: any) => {
      if (role.key != "" && role.value != "" && role.discord_role_id != "") {
        if (role.required_balance == "") {
          role.required_balance = 1
        }
        roles.push(role)
      }
    })
    newProjectConfig.roles = roles
  }
  if (validationFailures.length > 0) {
    logger.info("invalid request:", JSON.stringify(validationFailures))
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

  // save and return
  logger.info(`successfully created project ${projectNameCamel} for owner ${publicKeyString}`)
  return res.json(newProjectConfig)
})

// Endpoint to validate a hodler and add role 
app.post('/updateProject', async (req: any, res: Response) => {

  // Validates signature sent from client
  var publicKeyString = req.body.publicKey
  if (!isSignatureValid(publicKeyString, req.body.signature, process.env.MESSAGE)) {
    logger.info(`signature invalid for public key ${publicKeyString}`)
    return res.sendStatus(400)
  }

  // validate user owns the project
  var projectName = ""
  try {
    var userProject = JSON.parse(await read(getPublicKeyFilePath(req.body.publicKey)))
    if (!userProject || userProject.projectName == "") {
      logger.info(`address ${req.body.publicKey} does not own a project`)
      return res.sendStatus(401)
    }
    projectName = userProject.projectName
  } catch (e) {
    logger.info("user does not own project", e)
    return res.sendStatus(401)
  }

  // validate project name does not already exist
  const config = await getConfig(projectName)
  if (!config) {
    logger.info(`project does not exist: ${projectName}`)
    return res.sendStatus(404)
  }

  // Has the management wallet become a token holder to unlock premium features? Only
  // make this check if the user is not currently a holder. We will allow previous
  // holders to remain holders even if the NFT is transferred out of the wallet.
  if (!config.is_holder) {
    var holderRoles = await getHodlerRoles(publicKeyString, {
      discord_role_id: "project-verified",
      update_authority: process.env.UPDATE_AUTHORITY,
      spl_token: process.env.SPL_TOKEN
    })
    config.is_holder = holderRoles.length > 0
  }

  // update values that have been modified
  if (req.body.discord_url) {
    config.discord_url = getFieldValue(req.body.discord_url)
  }
  if (req.body.discord_client_id) {
    config.discord_client_id = getFieldValue(req.body.discord_client_id)
  }
  if (req.body.discord_server_id) {
    config.discord_server_id = getFieldValue(req.body.discord_server_id)
  }
  if (req.body.discord_role_id) {
    config.discord_role_id = getFieldValue(req.body.discord_role_id)
  }
  if (req.body.discord_bot_token && req.body.discord_bot_token != defaultRedactedString) {
    config.discord_bot_token = getFieldValue(req.body.discord_bot_token)
  }
  if (req.body.discord_webhook && req.body.discord_webhook != defaultRedactedString) {
    config.discord_webhook = getFieldValue(req.body.discord_webhook)
  }
  if (req.body.update_authority) {
    config.update_authority = getFieldValue(req.body.update_authority)
  }
  if (req.body.project_friendly_name) {
    config.project_friendly_name = getFieldValue(req.body.project_friendly_name)
  }
  if (req.body.project_twitter_name) {
    config.project_twitter_name = getFieldValue(req.body.project_twitter_name)
  }
  if (req.body.project_website) {
    config.project_website = getFieldValue(req.body.project_website)
  }
  if (req.body.royalty_wallet_id) {
    config.royalty_wallet_id = getFieldValue(req.body.royalty_wallet_id)
  }
  if (req.body.spl_token) {
    config.spl_token = getFieldValue(req.body.spl_token)
  }
  if (req.body.twitterAccessToken) {
    config.twitterAccessToken = getFieldValue(req.body.twitterAccessToken)
  }
  if (req.body.twitterTokenSecret) {
    config.twitterTokenSecret = getFieldValue(req.body.twitterTokenSecret)
  }
  if (req.body.twitterUsername) {
    config.connected_twitter_name = getFieldValue(req.body.twitterUsername)
  }
  if (req.body.discord_roles) {
    var roles: any[] = []
    req.body.discord_roles.forEach((role: any) => {
      if (role.key != "" && role.value != "" && role.discord_role_id != "") {
        if (role.required_balance == "") {
          role.required_balance = 1
        }
        roles.push(role)
      }
    })
    config.roles = roles
  }

  // write updated config
  var isSuccessful = await write(getConfigFilePath(projectName), JSON.stringify(config))
  if (!isSuccessful) {
    return res.sendStatus(500)
  }

  // save and return
  logger.info(`successfully updated project ${projectName} for owner ${publicKeyString}`)
  return res.json(config)
})

// Endpoint to validate a hodler and add role 
app.post('/logHodlers', async (req: Request, res: Response) => {

  // wallet public key string
  var publicKeyString = req.body.publicKey

  try {

    // retrieve config and ensure it is valid
    const config = await getConfig(req.body.projectName)
    if (!config) {
      return res.sendStatus(404)
    }

    // validate free tier not over verification limit
    var maxFreeVerifications = parseInt((process.env.MAX_FREE_VERIFICATIONS) ? process.env.MAX_FREE_VERIFICATIONS : "-1")
    if (!config.is_holder && maxFreeVerifications > 0) {
      if (config.verifications > maxFreeVerifications) {
        logger.info(`free verifications for ${req.body.projectName} has been reached (${config.verifications})`)
        return res.sendStatus(403)
      }
    }

    // Validates signature sent from client
    if (!isSignatureValid(publicKeyString, req.body.signature, config.message)) {
      logger.info(`signature invalid for public key ${publicKeyString}`)
      return res.sendStatus(400)
    }

    // store the discord name from the body
    const discordName = req.body.discordName

    // If matched NFTs are not empty and it's not already in the JSON push it
    var updatedConfig = false
    var verifiedRoles = await getHodlerRoles(publicKeyString, config)
    if (verifiedRoles.length > 0) {
      let hasHodler = false
      var hodlerList = await getHodlerList(req.body.projectName)
      for (let n of hodlerList) {
        if (n.discordName === discordName && n.publicKey == publicKeyString) {
          hasHodler = true
        }
      }
      if (!hasHodler) {
        logger.info(`adding ${discordName} to hodler list with wallet ${publicKeyString}`)
        hodlerList.push({
          discordName: discordName,
          publicKey: publicKeyString,
          roles: verifiedRoles
        })

        // increment verification count
        var count = (config.verifications) ? config.verifications : 0
        config.verifications = ++count
        updatedConfig = true
      }
    } else {
      logger.info("user not verified: " + publicKeyString)
      return res.sendStatus(401)
    }

    const username = discordName.split('#')[0]
    const discriminator = discordName.split('#')[1]
    const client = await getDiscordClient(req.body.projectName)
    if (!client) {
      return res.sendStatus(404)
    }

    // Update role
    var rolesAdded: any[] = []
    const myGuild = await client.guilds.cache.get(config.discord_server_id)
    if (!myGuild) {
      logger.info(`wallet ${publicKeyString} error retrieving server information`)
      return res.sendStatus(500)
    }
    const doer = await myGuild.members.cache.find((member: any) => (member.user.username === username && member.user.discriminator === discriminator))
    if (!doer) {
      logger.info(`wallet ${publicKeyString} error finding user ${discordName} on server ${config.discord_server_id}`)
      return res.sendStatus(404)
    }
    for (var i = 0; i < verifiedRoles.length; i++) {
      const role = await myGuild.roles.cache.find((r: any) => r.id === verifiedRoles[i])
      if (!role) {
        logger.info(`wallet ${publicKeyString} error retrieving role information ${verifiedRoles[i]}`)
        continue
      }
      await doer.roles.add(role)
      logger.info(`wallet ${publicKeyString} successfully added user ${discordName} role ${verifiedRoles[i]}`)
      rolesAdded.push(verifiedRoles[i])
    }

    // write the config if updated
    if (updatedConfig) {
      await write(getConfigFilePath(req.body.projectName), JSON.stringify(config))
    }

    // write result and return successfully
    await write(getHodlerFilePath(req.body.projectName), JSON.stringify(hodlerList))
    res.json(rolesAdded)
  } catch (e) {
    logger.info(`error processing wallet ${publicKeyString}`, e)
    res.sendStatus(500)
  }
})

// Endpoint to get all hodlers
app.get('/getHodlers', async (req: Request, res: Response) => {
  var config = await getConfig(req.query["project"])
  if (config) {
    return res.json(await getHodlerList(req.query["project"]))
  }
  return res.sendStatus(404)
})

// export the app
module.exports = app
