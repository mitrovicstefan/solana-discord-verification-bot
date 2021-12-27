const bodyParser = require('body-parser')
const app = require('express')()
import {Request, Response} from 'express'
const { getParsedNftAccountsByOwner } = require('@nfteyez/sol-rayz')
const fs = require('fs')
const nacl = require('tweetnacl')
const { PublicKey } = require('@solana/web3.js')
const { Client, Intents } = require('discord.js')

const mint_list = require('./mint_list.json')
const hodlerList = require('./hodlers.json')

// Create a new client instance
let allIntents = new Intents()
allIntents.add(Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_PRESENCES)
const client = new Client({ intents: allIntents });

// Login to Discord with your client's token
client.login(process.env.DISCORD_BOT_TOKEN);

// Endpoint to get all hodlers - protect it if you'd like
app.use(bodyParser.json())
app.get('/getHodlers', async (req: Request, res: Response) => {
  return res.json(hodlerList)
})

app.post('/logHodlers', async (req: Request, res: Response) => {
	const publicKeyString = req.body.publicKey
  const signature = req.body.signature
  const message = process.env.MESSAGE
  const encodedMessage = new TextEncoder().encode(message)
  let publicKey = new PublicKey(publicKeyString).toBytes()
  const encryptedSignature = new Uint8Array(signature.data)

  // Validates signature sent from client
  const isValid = nacl.sign.detached.verify(encodedMessage, encryptedSignature, publicKey)
  if(!isValid) {
    return res.status(400)
  }

	const discordName = req.body.discordName
	let tokenList

  // Parses all tokens from that public key
	try {
		tokenList = await getParsedNftAccountsByOwner({publicAddress: publicKeyString})
	} catch (e) {
		console.log("Error parsing NFTs", e)
	}

  // Basic ass way to find matched NFTs compared to the mint list ( PRs welcome <3 )
	let matched = []
	for (let item of tokenList) {
		if(mint_list.includes(item.mint)) matched.push(item)
	}

  // If matched NFTs are not empty and it's not already in the JSON push it
	if(matched.length !== 0) {
		let hasHodler = false
		for (let n of hodlerList) {
			if(n.discordName === discordName) hasHodler = true
		}
		if(!hasHodler) {
			hodlerList.push({
				discordName: discordName,
				publicKey: publicKeyString
			})
		}
	}

  const username = discordName.split('#')[0]
  const discriminator = discordName.split('#')[1]

  // Update role
  // client.on('ready', async () => {
    const myGuild = await client.guilds.cache.get(process.env.DISCORD_SERVER_ID)
    const role = await myGuild.roles.cache.find((r: any) => r.id === process.env.DISCORD_ROLE_ID)
    const doer = await myGuild.members.cache.find((member: any) => (member.user.username === username && member.user.discriminator === discriminator))
    await doer.roles.add(role)
    // await client.destroy()
  // });

  fs.writeFileSync('./server-middleware/hodlers.json', JSON.stringify(hodlerList))

	res.sendStatus(200)
})

module.exports = app
