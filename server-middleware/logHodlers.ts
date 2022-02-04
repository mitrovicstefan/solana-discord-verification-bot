const bodyParser = require('body-parser')
const axios = require('axios')
const app = require('express')()
import { Request, Response } from 'express'
const { getParsedNftAccountsByOwner } = require('@nfteyez/sol-rayz')
const fs = require('fs')
const nacl = require('tweetnacl')
const { PublicKey } = require('@solana/web3.js')
const { Client, Intents } = require('discord.js')

const hodlerList = require('./hodlers.json')

// Create a new client instance
let allIntents = new Intents()
allIntents.add(Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES, Intents.FLAGS.GUILD_MESSAGES)
const client = new Client({ intents: allIntents });

/// ADDING COMMAND

// Set the prefix
let prefix = "!";
let redirect_url = process.env.DISCORD_REDIRECT_URI;
client.on("messageCreate", (message: { content: { startsWith: (prefix: string) => boolean }, channel: any, author: any, }) => {
  // Exit and stop if the prefix is not there or if user is a bot
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  if (message.content.startsWith(`${prefix}verify`)) {
    message.channel.send(`Hey ${message.author}, Visit ${redirect_url} to gain your special role!`);
  }
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_BOT_TOKEN);

// Endpoint to get all hodlers - protect it if you'd like
app.use(bodyParser.json())
app.get('/getHodlers', async (req: Request, res: Response) => {
  return res.json(hodlerList)
})

// Retrieves the clientside config for discord validation
app.get('/getConfig', async (req: Request, res: Response) => {
  try {
    var contents = fs.readFileSync(`./config/prod-${req.query["project"]}.json`, { encoding: 'utf8', flag: 'r' })
    var contentJSON = JSON.parse(contents)
    return res.json({
      client_id: contentJSON.discord_client_id,
      redirect_uri: contentJSON.discord_redirect_url,
      message: contentJSON.message
    })
  } catch (e) {
    console.log("error reading file", e)
  }
  return res.sendStatus(404)
})

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

app.post('/logHodlers', async (req: Request, res: Response) => {
  const publicKeyString = req.body.publicKey
  const signature = req.body.signature
  const message = process.env.MESSAGE
  const encodedMessage = new TextEncoder().encode(message)
  let publicKey = new PublicKey(publicKeyString).toBytes()
  const encryptedSignature = new Uint8Array(signature.data)

  // Validates signature sent from client
  const isValid = nacl.sign.detached.verify(encodedMessage, encryptedSignature, publicKey)
  if (!isValid) {
    return res.status(400)
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
    if (item.updateAuthority === process.env.UPDATE_AUTHORITY) {
      console.log("item matches expected update authority: " + item.mint)
      matched.push(item)
      break
    }
  }

  // Optionally check for spl-tokens matching mint IDs if NFTs were not found
  if (matched.length == 0) {
    try {
      splTokenBalance = await getTokenBalance(publicKeyString, process.env.SPL_TOKEN)
      console.log("spl token balance: " + splTokenBalance)
    } catch (e) {
      console.log("Error getting spl token balance", e)
    }
  }

  // If matched NFTs are not empty and it's not already in the JSON push it
  if (matched.length !== 0 || splTokenBalance > 0) {
    let hasHodler = false
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

  // Update role
  console.log("Looking up server with ID: " + process.env.DISCORD_SERVER_ID)
  const myGuild = await client.guilds.cache.get(process.env.DISCORD_SERVER_ID)
  if (!myGuild) {
    console.log("error retrieving server information")
    return res.sendStatus(500)
  }
  console.log("Looking up role with ID: " + process.env.DISCORD_ROLE_ID)
  const role = await myGuild.roles.cache.find((r: any) => r.id === process.env.DISCORD_ROLE_ID)
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

  try {
    fs.writeFileSync('./server-middleware/hodlers.json', JSON.stringify(hodlerList))
    console.log("successfully updated hodler list")
  } catch (e) {
    console.log("error writing to file system", e)
  }

  res.sendStatus(200)
})

app.get('/reloadHolders', async (req: Request, res: Response) => {
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
      if (item.updateAuthority === process.env.UPDATE_AUTHORITY) {
        console.log("item matches expected update authority: " + item.mint)
        matched.push(item)
        break
      }
    }

    if (matched.length === 0) {
      hodlerList.splice(n, 1)
      const username = holder.discordName.split('#')[0]
      const discriminator = holder.discordName.split('#')[1]

      const myGuild = await client.guilds.cache.get(process.env.DISCORD_SERVER_ID)
      const role = await myGuild.roles.cache.find((r: any) => r.id === process.env.DISCORD_ROLE_ID)
      const doer = await myGuild.members.cache.find((member: any) => (member.user.username === username && member.user.discriminator === discriminator))
      await doer.roles.remove(role)
    }

    fs.writeFileSync('./server-middleware/hodlers.json', JSON.stringify(hodlerList))

    res.status(200).send("Removed all paperhands b0ss")
  }
})

module.exports = app
