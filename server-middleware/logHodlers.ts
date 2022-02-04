const bodyParser = require('body-parser')
const axios = require('axios')
const app = require('express')()
import { Request, Response } from 'express'
import { initializeStorage, read, write } from './storage/persist'
const { getParsedNftAccountsByOwner } = require('@nfteyez/sol-rayz')
const fs = require('fs')
const nacl = require('tweetnacl')
const { PublicKey } = require('@solana/web3.js')
const { Client, Intents } = require('discord.js')

/**
 * Configure the Discord client
 */

// Cache of discord clients available on this server
const discordClients = new Map<any, any>()

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

    if (message.content.startsWith(`${prefix}verify`)) {
      message.channel.send(`Hey ${message.author}, Visit ${redirect_url} to gain your special role!`);
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
 * Helper methods
 */

// retreives the current hodler list in JSON format
const getHodlerList = async (name: any) => {
  var hodlerListStr = await read(getHodlerFilePath(name))
  return JSON.parse((hodlerListStr != "") ? hodlerListStr : "[]")
}

function getHodlerFilePath(name: any) {
  return `./server-middleware/hodlers-${name}.json`
}

// retrieve configuration from filesystem
async function getConfig(name: any) {
  try {
    var contents = await read(`./config/prod-${name}.json`)
    return JSON.parse(contents)
  } catch (e) {
    console.log("error reading file", e)
  }
  return null
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

/**
 * API endpoint implementation
 */

// Configure the middleware to parse JSON
app.use(bodyParser.json())

// Retrieves the clientside config for discord validation
app.get('/getConfig', async (req: Request, res: Response) => {
  var config = await getConfig(req.query["project"])
  if (config) {
    return res.json({
      client_id: config.discord_client_id,
      redirect_uri: config.discord_redirect_url,
      message: config.message
    })
  }
  return res.sendStatus(404)
})

// Endpoint to get all hodlers - protect it if you'd like
app.get('/getHodlers', async (req: Request, res: Response) => {
  return res.json(await getHodlerList(req.query["project"]))
})

// Endpoint to validate a hodler and add role 
app.post('/logHodlers', async (req: Request, res: Response) => {

  // retrieve config and ensure it is valid
  const config = await getConfig(req.body.projectName)
  if (!config) {
    return res.sendStatus(404)
  }

  const publicKeyString = req.body.publicKey
  const signature = req.body.signature
  const message = config.message
  const encodedMessage = new TextEncoder().encode(message)
  let publicKey = new PublicKey(publicKeyString).toBytes()
  const encryptedSignature = new Uint8Array(signature.data)

  // Validates signature sent from client
  const isValid = nacl.sign.detached.verify(encodedMessage, encryptedSignature, publicKey)
  if (!isValid) {
    return res.sendStatus(400)
  }

  const discordName = req.body.discordName
  let tokenList
  let splTokenBalance = 0

  // Parses all tokens from that public key
  try {
    tokenList = await getParsedNftAccountsByOwner({ publicAddress: publicKeyString })
  } catch (e) {
    console.log("Error parsing NFTs", e)
  }

  // Basic ass way to find matched NFTs compared to the mint list ( PRs welcome <3 )
  let matched = []
  for (let item of tokenList) {
    if (item.updateAuthority === config.update_authority) {
      console.log("item matches expected update authority: " + item.mint)
      matched.push(item)
      break
    }
  }

  // Optionally check for spl-tokens matching mint IDs if NFTs were not found
  if (matched.length == 0) {
    try {
      splTokenBalance = await getTokenBalance(publicKeyString, config.spl_token)
      console.log("spl token balance: " + splTokenBalance)
    } catch (e) {
      console.log("Error getting spl token balance", e)
    }
  }

  // If matched NFTs are not empty and it's not already in the JSON push it
  if (matched.length !== 0 || splTokenBalance > 0) {
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
  console.log("Looking up server with ID: " + config.discord_server_id)
  const myGuild = await client.guilds.cache.get(config.discord_server_id)
  if (!myGuild) {
    console.log("error retrieving server information")
    return res.sendStatus(500)
  }
  console.log("Looking up role with ID: " + config.discord_role_id)
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

  // write result and return successfully
  await write(getHodlerFilePath(req.body.projectName), JSON.stringify(hodlerList))
  res.sendStatus(200)
})

// Endpoint to validate current hodlers
app.get('/reloadHolders', async (req: Request, res: Response) => {

  // retrieve config and ensure it is valid
  const config = await getConfig(req.query["project"])
  if (!config) {
    return res.sendStatus(404)
  }

  // iterate the hodler list
  var hodlerList = await getHodlerList(req.query["project"])
  for (let n in hodlerList) {
    const holder = hodlerList[n]
    let tokenList
    try {
      tokenList = await getParsedNftAccountsByOwner({ publicAddress: holder.publicKey })
    } catch (e) {
      res.status(400).send("There was a problem with parsing NFTs")
      console.log("Error parsing NFTs", e)
    }

    let matched = []
    for (let item of tokenList) {
      if (item.updateAuthority === config.update_authority) {
        console.log("item matches expected update authority: " + item.mint)
        matched.push(item)
        break
      }
    }

    if (matched.length === 0) {
      hodlerList.splice(n, 1)
      const username = holder.discordName.split('#')[0]
      const discriminator = holder.discordName.split('#')[1]
      const client = await getDiscordClient(req.query["project"])
      if (!client) {
        return res.sendStatus(404)
      }

      const myGuild = await client.guilds.cache.get(config.discord_server_id)
      const role = await myGuild.roles.cache.find((r: any) => r.id === config.discord_role_id)
      const doer = await myGuild.members.cache.find((member: any) => (member.user.username === username && member.user.discriminator === discriminator))
      await doer.roles.remove(role)
    }

    // write file and return successfully
    await write(getHodlerFilePath(req.query["project"]), JSON.stringify(hodlerList))
    res.status(200).send("Removed all paperhands b0ss")
  }
})

module.exports = app
