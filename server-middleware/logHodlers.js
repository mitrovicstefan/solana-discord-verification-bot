const bodyParser = require('body-parser')
const app = require('express')()
const { getParsedNftAccountsByOwner } = require('@nfteyez/sol-rayz')
const fs = require('fs')
const nacl = require('tweetnacl')
const mint_list = require('./mint_list.json')
const hodlerList = require('./hodlers.json')
const { PublicKey } = require('@solana/web3.js')
const atob = require('atob');
const nacutil = require('tweetnacl-util');
const {decodeUTF8} = require("tweetnacl-util");

app.use(bodyParser.json())
app.get('/getHodlers', async (req, res) => {
	return res.json(hodlerList)
})

app.post('/logHodlers', async (req, res) => {
	const publicKeyString = req.body.publicKey
  const signature = req.body.signature
  const message = 'test'
  const encodedMessage = new TextEncoder().encode(message)
  let publicKey = new PublicKey(publicKeyString).toBytes()
  const encryptedSignature = new Uint8Array(signature.data)

  const isValid = nacl.sign.detached.verify(encodedMessage, encryptedSignature, publicKey)
  if(!isValid) {
    return res.status(400)
  }
	const discordName = req.body.discordName
	let tokenList
	try {
		tokenList = await getParsedNftAccountsByOwner({publicAddress: 'ExBkQ7BMgheBXvfoZ7jgmSCx2pkZ6oYd92Mberf8iSTe'})
	} catch (e) {
		console.log("ERR OCCURED", e)
	}

	let matched = []
	for (let item of tokenList) {
		if(mint_list.includes(item.mint)) matched.push(item)
	}

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
	console.log("Writting hodlers", hodlerList)

	fs.writeFileSync('./server-middleware/hodlers.json', JSON.stringify(hodlerList))
	res.sendStatus(200)
})

module.exports = app
